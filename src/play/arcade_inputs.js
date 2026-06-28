/** @namespace ty */
// Purpose: pointer click → Oimo raycast → arcade.pick with itemIndex.

import * as THREE from "three";
import { oimo } from "../lib/OimoPhysics.js";
import { v3up, vzero } from "../math.js";

const RAY_MAX = 500;

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _rayEnd = new THREE.Vector3();
const _rayBegin = new oimo.common.Vec3();
const _rayEndOimo = new oimo.common.Vec3();
const _floorPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3up, vzero);
const _floorHit = new THREE.Vector3();
const RayCastClosest = oimo.dynamics.callback.RayCastClosest;

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
		this._rayCast = new RayCastClosest();
		/** @type {THREE.Vector3} */
		this.pointer_floor = new THREE.Vector3();
		/** @type {number|null} */
		this._pointer_click_id = null;
		/** @type {number|null} */
		this._pointer_move_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-28, Composer: pointer.click Oimo raycast emits arcade.pick [plinp1]
		this._pointer_click_id = this._core.eventsbus.on(
			"pointer.down",
			this._on_pointer_click.bind(this),
		);
		// 2026-06-28, Composer: pointer.move floor plane intersect stores floor [plinp4]
		this._pointer_move_id = this._core.eventsbus.on(
			"pointer.move",
			this._on_pointer_move.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._pointer_click_id != null) {
			this._core.eventsbus.off(this._pointer_click_id);
			this._pointer_click_id = null;
		}
		if (this._pointer_move_id != null) {
			this._core.eventsbus.off(this._pointer_move_id);
			this._pointer_move_id = null;
		}
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

		// 2026-06-28, Composer: world ray NDC via draw.pointer_ndc [drwptr1]
		_raycaster.setFromCamera(_pointer, camera);
		return true;
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_move({ x, y }) {
		if (!this._pointer_ray(x, y)) {
			return;
		}

		// 2026-06-28, Composer: pointer.move floor plane intersect stores floor [plinp4]
		const hit = _raycaster.ray.intersectPlane(_floorPlane, _floorHit);
		if (hit) {
			this.pointer_floor.copy(hit);
		}
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_click({ x, y }) {
		const world = this._core.physics.world;
		if (!world || !this._pointer_ray(x, y)) {
			return;
		}

		const origin = _raycaster.ray.origin;
		_rayEnd.copy(_raycaster.ray.direction).multiplyScalar(RAY_MAX).add(origin);

		_rayBegin.init(origin.x, origin.y, origin.z);
		_rayEndOimo.init(_rayEnd.x, _rayEnd.y, _rayEnd.z);

		const hit = this._rayCast;
		hit.clear();
		world.rayCast(_rayBegin, _rayEndOimo, hit);
		if (!hit.hit || !hit.shape) {
			return;
		}

		const body = hit.shape.getRigidBody();
		const itemIndex = body?.userData?.itemIndex;
		if (itemIndex == null) {
			return;
		}

		// 2026-06-28, Composer: arcade.pick includes raycast hit position [plinp5]
		const pos = hit.position;
		this._core.eventsbus.emit("arcade.pick", {
			itemIndex,
			x: pos.x,
			y: pos.y,
			z: pos.z,
		});
	}
}

export default ArcadeInputs;
// 2026-06-28, Composer: pointer.click Oimo raycast emits arcade.pick [plinp1]
// 2026-06-28, Composer: arcade.pick includes raycast hit position [plinp5]
// 2026-06-28, Composer: pointer.move floor plane intersect stores floor [plinp4]
// 2026-06-28, Composer: world ray NDC via draw.pointer_ndc [drwptr1]
