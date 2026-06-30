/** @namespace ty */
// Purpose: pointer drag → Rapier raycast pick; emit arcade.pick on target change.

import * as THREE from "three";
import { RAPIER, cast_ray_and_get_normal } from "../core/physics.js";
import { v3up, vzero } from "../math.js";

const RAY_MAX = 500;

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _rayEnd = new THREE.Vector3();
const _rayOrigin = { x: 0, y: 0, z: 0 };
const _rayDir = { x: 0, y: 0, z: 0 };
const _floorPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3up, vzero);
const _floorHit = new THREE.Vector3();

/**
 * @class ArcadeInputs
 * @memberof pb.play
 */
class ArcadeInputs {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		this._core = core;
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {THREE.Vector3} */
		this.pointer_floor = new THREE.Vector3();
		/** @type {number|null} */
		this._pick_item_index = null;
		/** @type {number|null} */
		this._pointer_down_id = null;
		/** @type {number|null} */
		this._pointer_move_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		this._pointer_down_id = this._core.eventsbus.on(
			"pointer.down",
			this._on_pointer_down.bind(this),
		);
		this._pointer_move_id = this._core.eventsbus.on(
			"pointer.move",
			this._on_pointer_move.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._pointer_down_id != null) {
			this._core.eventsbus.off(this._pointer_down_id);
			this._pointer_down_id = null;
		}
		if (this._pointer_move_id != null) {
			this._core.eventsbus.off(this._pointer_move_id);
			this._pointer_move_id = null;
		}
		this._pick_item_index = null;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {boolean}
	 */
	_pointer_ray(x, y) {
		const camera = this._core.render.camera;
		if (!camera || !this._core.draw.pointer_ndc(x, y, _pointer)) {
			return false;
		}

		_raycaster.setFromCamera(_pointer, camera);
		return true;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {{ itemIndex: number, x: number, y: number, z: number }|null}
	 */
	trace_pick(x, y) {
		const world = this._core.physics.world;
		const physics = this._core.physics;
		if (!world || !this._pointer_ray(x, y)) {
			return null;
		}

		// 2026-06-29, Composer: Rapier castRayAndGetNormal pick [plinp1]
		const origin = _raycaster.ray.origin;
		const dir = _raycaster.ray.direction;
		_rayOrigin.x = origin.x;
		_rayOrigin.y = origin.y;
		_rayOrigin.z = origin.z;
		_rayDir.x = dir.x;
		_rayDir.y = dir.y;
		_rayDir.z = dir.z;

		const ray = new RAPIER.Ray(_rayOrigin, _rayDir);
		// 2026-06-30, Composer: castRay target-out via broadPhase helper [plinp2]
		const hit = cast_ray_and_get_normal(world, ray, RAY_MAX, true);
		if (!hit) {
			return null;
		}

		const gameId = physics.colliderToGameId.get(hit.collider.handle);
		const itemIndex = gameId != null ? physics.bodyMeta[gameId]?.itemIndex : null;
		if (itemIndex == null) {
			return null;
		}

		const pos = ray.pointAt(hit.timeOfImpact);
		return { itemIndex, x: pos.x, y: pos.y, z: pos.z };
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {void}
	 */
	pick_if_changed(x, y) {
		const pick = this.trace_pick(x, y);
		if (!pick || pick.itemIndex === this._pick_item_index) {
			return;
		}
		this._pick_item_index = pick.itemIndex;
		this._core.eventsbus.emit("arcade.pick", pick);
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_down({ x, y }) {
		this._pick_item_index = null;
		this.pick_if_changed(x, y);
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_move({ x, y }) {
		if (!this._pointer_ray(x, y)) {
			return;
		}

		const hit = _raycaster.ray.intersectPlane(_floorPlane, _floorHit);
		if (hit) {
			this.pointer_floor.copy(hit);
		}
	}

}

export default ArcadeInputs;
// 2026-06-29, Composer: Rapier castRayAndGetNormal pick [plinp1]
// 2026-06-30, Composer: castRay target-out via broadPhase helper [plinp2]
