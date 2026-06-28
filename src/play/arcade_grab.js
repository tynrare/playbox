/** @namespace ty */
// Purpose: grab toys on pick, pull grabbed bodies toward pointer_floor + y5.

import { oimo } from "../lib/OimoPhysics.js";
import { TOY_INDEX_INVALID } from "../scene/itembox.js";

const GRAB_LIFT_Y = 3;
const GRAB_STIFFNESS = 70;
const GRAB_DAMPING = 20;
const GRAB_IMPULSE_STRENGTH = 6;

const _pos = new oimo.common.Vec3();
const _vel = new oimo.common.Vec3();
const _force = new oimo.common.Vec3();
const _impulse = new oimo.common.Vec3();
const _pickPos = new oimo.common.Vec3();

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
		/** @type {Set<number>} */
		this._grabbed = new Set();
		return this;
	}

	/** @returns {void} */
	stop() {
		this.drop();
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @param {number} toyIndex
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @returns {void}
	 */
	grab(toyIndex, x, y, z) {
		// 2026-06-28, Composer: one-shot pick-point impulse on grab [plgrb10]
		if (toyIndex === TOY_INDEX_INVALID) {
			return;
		}
		if (this._grabbed.has(toyIndex)) {
			this._grabbed.delete(toyIndex);
			return;
		}
		this._grabbed.add(toyIndex);

		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const body = this._core.scene.get_itembody(itemIndex);
		if (!body) {
			return;
		}

		body.getPositionTo(_pos);
		const pf = this._inputs.pointer_floor;
		const tx = pf.x;
		const ty = pf.y + GRAB_LIFT_Y;
		const tz = pf.z;
		// 2026-06-28, Composer: grab impulse uses fixed strength toward target [plgrb11]
		let dx = tx - _pos.x;
		let dy = ty - _pos.y;
		let dz = tz - _pos.z;
		const len = Math.hypot(dx, dy, dz);
		const mass = body.getMass();
		if (len <= 0 || mass <= 0) {
			return;
		}
		const scale = GRAB_IMPULSE_STRENGTH / len * mass;
		_impulse.init(dx * scale, dy * scale, dz * scale);
		_pickPos.init(x, y, z);
		body.wakeUp();
		body.applyImpulse(_impulse, _pickPos);
	}

	/** @returns {void} */
	drop() {
		// 2026-06-28, Composer: drop clears all grabbed toys [plgrb1]
		this._grabbed.clear();
	}

	/**
	 * @param {number} dt
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	toyupdate(_dt, toyIndex) {
		if (!this._grabbed.has(toyIndex)) {
			return;
		}

		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const body = this._core.scene.get_itembody(itemIndex);
		if (!body) {
			return;
		}

		// 2026-06-28, Composer: mass-scaled PD so light toys match heavy accel [plgrb6]
		body.getPositionTo(_pos);
		body.getLinearVelocityTo(_vel);
		const mass = body.getMass();
		if (mass <= 0) {
			return;
		}
		const pf = this._inputs.pointer_floor;
		const tx = pf.x;
		const ty = pf.y + GRAB_LIFT_Y;
		const tz = pf.z;
		_force.init(
			((tx - _pos.x) * GRAB_STIFFNESS - _vel.x * GRAB_DAMPING) * mass,
			((ty - _pos.y) * GRAB_STIFFNESS - _vel.y * GRAB_DAMPING) * mass,
			((tz - _pos.z) * GRAB_STIFFNESS - _vel.z * GRAB_DAMPING) * mass,
		);
		body.wakeUp();
		body.applyForceToCenter(_force);
	}
}

export default ArcadeGrab;
// 2026-06-28, Composer: grab adds toy index to grabbed set [plgrb1]
// 2026-06-28, Composer: pull grabbed body toward pointer_floor+y5 [plgrb2]
// 2026-06-28, Composer: PD grab force spring plus velocity damping [plgrb5]
// 2026-06-28, Composer: mass-scaled PD so light toys match heavy accel [plgrb6]
// 2026-06-28, Composer: one-shot pick-point impulse on grab [plgrb10]
// 2026-06-28, Composer: grab impulse uses fixed strength toward target [plgrb11]
