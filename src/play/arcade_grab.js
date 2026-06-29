/** @namespace ty */
// Purpose: grab toys on pick, pull toward lerped lift target on y plane.

import * as THREE from "three";
import { oimo } from "../lib/OimoPhysics.js";
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
const _pos = new oimo.common.Vec3();
const _vel = new oimo.common.Vec3();
const _force = new oimo.common.Vec3();
const _impulse = new oimo.common.Vec3();
const _pickPos = new oimo.common.Vec3();

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
		// 2026-06-28, Composer: straight lift snapshot body xz at plane y [plgrb19]
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
		// 2026-06-28, Composer: grabdata pool pop or alloc on grab [plgrb20]
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
		// 2026-06-28, Composer: grab owns pointer down move up [plgrb15]
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
		// 2026-06-28, Composer: camera ray intersect grab plane y [plgrb16]
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
		// 2026-06-28, Composer: grab add only no toggle drop [plgrb12]
		if (toyIndex === TOY_INDEX_INVALID || this._grabbed.has(toyIndex)) {
			return;
		}

		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const body = this._core.scene.get_itembody(itemIndex);
		if (!body) {
			return;
		}

		body.getPositionTo(_pos);
		const data = this._acquire_grabdata(_pos.x, _pos.z);
		const tx = data.straight.x;
		const ty = data.straight.y;
		const tz = data.straight.z;
		// 2026-06-28, Composer: grab impulse uses fixed strength toward target [plgrb11]
		let dx = tx - _pos.x;
		let dy = ty - _pos.y;
		let dz = tz - _pos.z;
		const len = Math.hypot(dx, dy, dz);
		const mass = body.getMass();
		if (len <= 0 || mass <= 0) {
			this._release_grabdata(data);
			return;
		}
		this._grabbed.set(toyIndex, data);
		const scale = GRAB_IMPULSE_STRENGTH / len * mass;
		_impulse.init(dx * scale, dy * scale, dz * scale);
		_pickPos.init(x, y, z);
		body.wakeUp();
		body.applyImpulse(_impulse, _pickPos);
	}

	/** @returns {void} */
	drop() {
		// 2026-06-28, Composer: drop clears all grabbed toys [plgrb1]
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

		// 2026-06-28, Composer: mass-scaled PD so light toys match heavy accel [plgrb6]
		// 2026-06-28, Composer: lerp straight y5 toward cursor over blend [plgrb18]
		body.getPositionTo(_pos);
		body.getLinearVelocityTo(_vel);
		const mass = body.getMass();
		if (mass <= 0) {
			return;
		}
		const target = cache.vec3.v0.copy(data.straight).lerp(_grabTarget, t);
		_force.init(
			((target.x - _pos.x) * GRAB_STIFFNESS - _vel.x * GRAB_DAMPING),
			((target.y - _pos.y) * GRAB_STIFFNESS - _vel.y * GRAB_DAMPING),
			((target.z - _pos.z) * GRAB_STIFFNESS - _vel.z * GRAB_DAMPING),
		).scaleEq(t1 * mass);
		// 2026-06-28, Composer: counter world gravity while grabbed [plgrb21]
		const world = this._core.physics.world;
		if (world) {
			const gravity = world.getGravity();
			const gravity_scale = body.getGravityScale();
			_force.x -= gravity.x * gravity_scale * mass;
			_force.y -= gravity.y * gravity_scale * mass;
			_force.z -= gravity.z * gravity_scale * mass;
		}
		body.wakeUp();
		body.applyForceToCenter(_force);
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
// 2026-06-28, Composer: grab adds toy index to grabbed set [plgrb1]
// 2026-06-28, Composer: PD grab force spring plus velocity damping [plgrb5]
// 2026-06-28, Composer: mass-scaled PD so light toys match heavy accel [plgrb6]
// 2026-06-28, Composer: one-shot pick-point impulse on grab [plgrb10]
// 2026-06-28, Composer: grab impulse uses fixed strength toward target [plgrb11]
// 2026-06-28, Composer: grab add only no toggle drop [plgrb12]
// 2026-06-28, Composer: pull toward camera ray lift plane hit [plgrb14]
// 2026-06-28, Composer: grab owns pointer down move up [plgrb15]
// 2026-06-28, Composer: camera ray intersect grab plane y [plgrb16]
// 2026-06-28, Composer: lerp straight y5 toward cursor over blend [plgrb18]
// 2026-06-28, Composer: straight lift snapshot body xz at plane y [plgrb19]
// 2026-06-28, Composer: grabdata pool pop or alloc on grab [plgrb20]
// 2026-06-28, Composer: counter world gravity while grabbed [plgrb21]
