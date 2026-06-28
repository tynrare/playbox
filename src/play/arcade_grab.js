/** @namespace ty */
// Purpose: grab toys on pick, pull grabbed bodies toward pointer_floor + y5.

import { oimo } from "../lib/OimoPhysics.js";
import { TOY_INDEX_INVALID } from "../scene/itembox.js";

const GRAB_LIFT_Y = 3;
const GRAB_STIFFNESS = 70;
const GRAB_DAMPING = 20;

const _pos = new oimo.common.Vec3();
const _vel = new oimo.common.Vec3();
const _force = new oimo.common.Vec3();

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
	 * @returns {void}
	 */
	grab(toyIndex) {
		// 2026-06-28, Composer: grab adds toy index to grabbed set [plgrb1]
		if (toyIndex === TOY_INDEX_INVALID) {
			return;
		}
		if (this._grabbed.has(toyIndex)) {
			this._grabbed.delete(toyIndex);
			return;
		}
		this._grabbed.add(toyIndex);
	}

	/** @returns {void} */
	drop() {
		// 2026-06-28, Composer: drop clears all grabbed toys [plgrb1]
		this._grabbed.clear();
	}

	/**
	 * @param {number} _dt
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
