/** @namespace ty */

// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
// 2026-06-26, Composer: arcade floor pose via vec3 and quat [plarc2]
// 2026-06-26, Composer: arcade spawn coin_a toy item body [plarc4]

import { cache } from "../math.js";

const COIN_STACK_COUNT = 10;
const COIN_STEP = 0.2;

/**
 * @class Arcade
 * @memberof pb.play
 */
class Arcade {
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
		/** @type {number|null} */
		this._floor_index = null;
		/** @type {number[]} */
		this._coin_indices = [];
		this._positions_applied = false;
		this._coin_positions_applied = 0;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
		this._core.scene.environment.floorstyle("floor", 0xffffff);
		this._core.scene.environment.shadowstyle(0x0, 0.5);

		this._floor_index = this._core.itembox.spawn("floor_item");
		this._positions_applied = false;
		this._coin_positions_applied = 0;

		this._core.render.camera.position.set(0, 10, 2);
		this._core.render.camera.lookAt(0, 0, 0);

		// 2026-06-26, Composer: arcade coin stack spawn loop [plstk1]
		this._coin_indices = [];
		for (let i = 0; i < COIN_STACK_COUNT; i++) {
			this._coin_indices.push(this._core.toybox.spawn("coin_a_toy", true));
		}
	}

	/**
	 * @param {number} _dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(_dt, _rdt) {
		this._apply_floor_position();
		this._apply_coin_position();
	}

	/** @returns {void} */
	stop() {
		for (const toy_index of this._coin_indices) {
			this._core.toybox.despawn(toy_index, true);
		}
		this._coin_indices = [];

		if (this._floor_index != null) {
			this._core.itembox.despawn(this._floor_index, true);
			this._floor_index = null;
		}

		this._core.scene.environment.floorstyle(null, 0xffffff);
		this._positions_applied = false;
		this._coin_positions_applied = 0;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/** @returns {void} */
	_apply_floor_position() {
		if (this._positions_applied || this._floor_index == null) {
			return;
		}

		const body = this._core.scene.get_itembody(this._floor_index);
		if (!body) {
			return;
		}

		// 2026-06-26, Composer: arcade floor pose via vec3 and quat [plarc2]
		this._core.scene.set_itemposition(this._floor_index, cache.vec3.v0.set(0, -0.05, 0));
		this._positions_applied = true;
	}

	/** @returns {void} */
	_apply_coin_position() {
		if (this._coin_positions_applied >= this._coin_indices.length) {
			return;
		}

		for (let i = this._coin_positions_applied; i < this._coin_indices.length; i++) {
			const item_index = this._core.toybox.get_item_index(this._coin_indices[i]);
			const entity = this._core.scene.get_itementity(item_index);
			if (!entity) {
				return;
			}

			const y = COIN_STEP * 0.5 + i * COIN_STEP;
			this._core.scene.set_itemposition(item_index, 3 + Math.random() * 0.1, y, -2 + Math.random() * 0.1);
			this._coin_positions_applied++;
		}
	}
}

export default Arcade;
// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
// 2026-06-26, Composer: arcade floor pose via vec3 and quat [plarc2]
// 2026-06-26, Composer: arcade spawn coin_a toy item body [plarc4]
// 2026-06-26, Composer: arcade coin stack spawn loop [plstk1]
