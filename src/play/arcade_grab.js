/** @namespace ty */
// Purpose: grab toys on pick, pull toward lerped lift target on y plane.

import * as THREE from "three";
import { TOY_INDEX_INVALID } from "../scene/itembox.js";
import { cache, clamp, v3up } from "../math.js";

const GRAB_PLANE_Y = 4;
const GRAB_BLEND_S = 1;
const GRAB_STIFFNESS = 100;
const GRAB_DAMPING = 30;
const GRAB_IMPULSE_STRENGTH = 6;

const _pointer = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _grabAnchor = new THREE.Vector3(0, GRAB_PLANE_Y, 0);
const _grabPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3up, _grabAnchor);
const _grabTarget = new THREE.Vector3();
const _force = { x: 0, y: 0, z: 0 };
const _impulse = { x: 0, y: 0, z: 0 };
const _pickPos = { x: 0, y: 0, z: 0 };

/**
 * @class GrabData
 * @memberof pb.play
 */
class GrabData {
	constructor() {
		/** @type {number} */
		this.elapsed = 0;
		/** @type {THREE.Vector3} */
		this.straight = new THREE.Vector3();
	}

	/**
	 * @param {number} x
	 * @param {number} z
	 * @returns {this}
	 */
	init(x, z) {
		this.elapsed = 0;
		this.straight.set(x, GRAB_PLANE_Y, z);
		return this;
	}

	/** @returns {this} */
	reset() {
		this.elapsed = 0;
		this.straight.set(0, 0, 0);
		return this;
	}
}

/**
 * @class ArcadeGrab
 * @memberof pb.play
 */
class ArcadeGrab {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {import("./arcade_inputs.js").default} inputs
	 */
	constructor(core, inputs) {
		this._core = core;
		this._inputs = inputs;
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {Map<number, GrabData>} */
		this._grabbed = new Map();
		/** @type {GrabData[]} */
		this._grabdata_pool = [];
		/** @type {boolean} */
		this._grabbing = false;
		/** @type {number} */
		this._pointer_x = 0;
		/** @type {number} */
		this._pointer_y = 0;
		/** @type {number|null} */
		this._pointer_down_id = null;
		/** @type {number|null} */
		this._pointer_up_id = null;
		/** @type {number|null} */
		this._pointer_move_id = null;
		return this;
	}

	/**
	 * @param {number} x
	 * @param {number} z
	 * @returns {GrabData}
	 */
	_acquire_grabdata(x, z) {
		const data = this._grabdata_pool.pop();
		if (data) {
			return data.init(x, z);
		}
		return new GrabData().init(x, z);
	}

	/**
	 * @param {GrabData} data
	 * @returns {void}
	 */
	_release_grabdata(data) {
		data.reset();
		this._grabdata_pool.push(data);
	}

	/** @returns {void} */
	start() {
		this._pointer_down_id = this._core.eventsbus.on(
			"pointer.down",
			this._on_pointer_down.bind(this),
		);
		this._pointer_up_id = this._core.eventsbus.on(
			"pointer.up",
			this._on_pointer_up.bind(this),
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
		if (this._pointer_up_id != null) {
			this._core.eventsbus.off(this._pointer_up_id);
			this._pointer_up_id = null;
		}
		if (this._pointer_move_id != null) {
			this._core.eventsbus.off(this._pointer_move_id);
			this._pointer_move_id = null;
		}
		this._grabbing = false;
		this.drop();
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @returns {boolean}
	 */
	_trace_grab_target() {
		const camera = this._core.render.camera;
		if (
			!camera
			|| !this._core.draw.pointer_ndc(this._pointer_x, this._pointer_y, _pointer)
		) {
			return false;
		}
		_raycaster.setFromCamera(_pointer, camera);
		return _raycaster.ray.intersectPlane(_grabPlane, _grabTarget) != null;
	}

	/**
	 * @param {number} toyIndex
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @returns {void}
	 */
	grab(toyIndex, x, y, z) {
		if (toyIndex === TOY_INDEX_INVALID || this._grabbed.has(toyIndex)) {
			return;
		}

		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const body = this._core.scene.get_itembody(itemIndex);
		if (!body) {
			return;
		}

		const pos = body.translation();
		const data = this._acquire_grabdata(pos.x, pos.z);
		const tx = data.straight.x;
		const ty = data.straight.y;
		const tz = data.straight.z;
		let dx = tx - pos.x;
		let dy = ty - pos.y;
		let dz = tz - pos.z;
		const len = Math.hypot(dx, dy, dz);
		const mass = body.mass();
		if (len <= 0 || mass <= 0) {
			this._release_grabdata(data);
			return;
		}
		this._grabbed.set(toyIndex, data);
		const scale = GRAB_IMPULSE_STRENGTH / len * mass;
		_impulse.x = dx * scale;
		_impulse.y = dy * scale;
		_impulse.z = dz * scale;
		_pickPos.x = x;
		_pickPos.y = y;
		_pickPos.z = z;
		body.wakeUp();
		body.applyImpulseAtPoint(_impulse, _pickPos, true);
	}

	/** @returns {void} */
	drop() {
		for (const data of this._grabbed.values()) {
			this._release_grabdata(data);
		}
		this._grabbed.clear();
	}

	/**
	 * @param {number} dt
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	toyupdate(dt, toyIndex) {
		const data = this._grabbed.get(toyIndex);
		if (!data) {
			return;
		}

		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const body = this._core.scene.get_itembody(itemIndex);
		if (!body || !this._trace_grab_target()) {
			return;
		}

		data.elapsed += dt;
		const t = clamp(0, 1, data.elapsed / GRAB_BLEND_S);
		const t1 = clamp(0, 1, data.elapsed / (GRAB_BLEND_S * 0.5));

		// 2026-06-29, Composer: addForce once per frame before physics.step [plgrb1]
		const pos = body.translation();
		const vel = body.linvel();
		const mass = body.mass();
		if (mass <= 0) {
			return;
		}
		const target = cache.vec3.v0.copy(data.straight).lerp(_grabTarget, t);
		_force.x = ((target.x - pos.x) * GRAB_STIFFNESS - vel.x * GRAB_DAMPING) * t1 * mass;
		_force.y = ((target.y - pos.y) * GRAB_STIFFNESS - vel.y * GRAB_DAMPING) * t1 * mass;
		_force.z = ((target.z - pos.z) * GRAB_STIFFNESS - vel.z * GRAB_DAMPING) * t1 * mass;
		const world = this._core.physics.world;
		if (world) {
			const gravity = world.gravity;
			const gravity_scale = body.gravityScale();
			_force.x -= gravity.x * gravity_scale * mass;
			_force.y -= gravity.y * gravity_scale * mass;
			_force.z -= gravity.z * gravity_scale * mass;
		}
		body.wakeUp();
		body.addForce(_force, true);
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_down({ x, y }) {
		this._grabbing = true;
		this._pointer_x = x;
		this._pointer_y = y;
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_move({ x, y }) {
		this._pointer_x = x;
		this._pointer_y = y;
		if (!this._grabbing) {
			return;
		}
		this._inputs.pick_if_changed(x, y);
	}

	/**
	 * @param {{ x: number, y: number }} detail
	 * @returns {void}
	 */
	_on_pointer_up(_detail) {
		this._grabbing = false;
		this.drop();
	}
}

export default ArcadeGrab;
// 2026-06-29, Composer: addForce once per frame before physics.step [plgrb1]
