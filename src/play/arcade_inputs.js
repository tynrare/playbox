/** @namespace ty */
// Purpose: pointer drag → Oimo raycast pick; emit arcade.pick on target change.

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
		/** @type {boolean} */
		this._grabbing = false;
		/** @type {number|null} */
		this._pick_item_index = null;
		/** @type {number|null} */
		this._pointer_down_id = null;
		/** @type {number|null} */
		this._pointer_up_id = null;
		/** @type {number|null} */
		this._pointer_move_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-28, Composer: pointer down sets grab flag and traces pick [plinp6]
		this._pointer_down_id = this._core.eventsbus.on(
			"pointer.down",
			this._on_pointer_down.bind(this),
		);
		// 2026-06-28, Composer: pointer up emits arcade.grab.drop [plinp7]
		this._pointer_up_id = this._core.eventsbus.on(
			"pointer.up",
			this._on_pointer_up.bind(this),
		);
		// 2026-06-28, Composer: pointer.move floor plane intersect stores floor [plinp4]
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
		if (this._pointer_up_id != null) {
			this._core.eventsbus.off(this._pointer_up_id);
			this._pointer_up_id = null;
		}
		if (this._pointer_move_id != null) {
			this._core.eventsbus.off(this._pointer_move_id);
			this._pointer_move_id = null;
		}
		this._grabbing = false;
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

		// 2026-06-28, Composer: world ray NDC via draw.pointer_ndc [drwptr1]
		_raycaster.setFromCamera(_pointer, camera);
		return true;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {{ itemIndex: number, x: number, y: number, z: number }|null}
	 */
	_trace_pick(x, y) {
		const world = this._core.physics.world;
		if (!world || !this._pointer_ray(x, y)) {
			return null;
		}

		const origin = _raycaster.ray.origin;
		_rayEnd.copy(_raycaster.ray.direction).multiplyScalar(RAY_MAX).add(origin);

		_rayBegin.init(origin.x, origin.y, origin.z);
		_rayEndOimo.init(_rayEnd.x, _rayEnd.y, _rayEnd.z);

		const hit = this._rayCast;
		hit.clear();
		world.rayCast(_rayBegin, _rayEndOimo, hit);
		if (!hit.hit || !hit.shape) {
			return null;
		}

		const body = hit.shape.getRigidBody();
		const itemIndex = body?.userData?.itemIndex;
		if (itemIndex == null) {
			return null;
		}

		const pos = hit.position;
		return { itemIndex, x: pos.x, y: pos.y, z: pos.z };
	}

	/**
	 * @param {{ itemIndex: number, x: number, y: number, z: number }|null} pick
	 * @returns {void}
	 */
	_emit_pick_if_changed(pick) {
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
		// 2026-06-28, Composer: pointer down sets grab flag and traces pick [plinp6]
		this._grabbing = true;
		this._pick_item_index = null;
		this._emit_pick_if_changed(this._trace_pick(x, y));
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

		if (!this._grabbing) {
			return;
		}

		// 2026-06-28, Composer: grab drag retraces pick each move [plinp8]
		this._emit_pick_if_changed(this._trace_pick(x, y));
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_up(_detail) {
		// 2026-06-28, Composer: pointer up emits arcade.grab.drop [plinp7]
		this._grabbing = false;
		this._pick_item_index = null;
		this._core.eventsbus.emit("arcade.grab.drop");
	}
}

export default ArcadeInputs;
// 2026-06-28, Composer: pointer down sets grab flag and traces pick [plinp6]
// 2026-06-28, Composer: pointer up emits arcade.grab.drop [plinp7]
// 2026-06-28, Composer: grab drag retraces pick each move [plinp8]
// 2026-06-28, Composer: pointer.move floor plane intersect stores floor [plinp4]
// 2026-06-28, Composer: world ray NDC via draw.pointer_ndc [drwptr1]
