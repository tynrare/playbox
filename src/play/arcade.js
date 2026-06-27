/** @namespace ty */

// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
// 2026-06-26, Composer: arcade floor pose via vec3 and quat [plarc2]
// 2026-06-26, Composer: arcade spawn coin_a toy item body [plarc4]

import { cache } from "../math.js";
import { BB_INVALID, BB_KEY_PLAY } from "../scene/blackboard.js";
import ArcadeSound from "./sound.js";

const COIN_STACK_COUNT = 10;
const DICE_STACK_COUNT = 3;
const COIN_STEP = 1;
// 2026-06-26, Composer: VAR_PLAY field offsets owned by arcade [plfld1]
const VAR_PLAY_STACK_INDEX = 2;
const VAR_PLAY_BASE_X = 3;
const VAR_PLAY_BASE_Z = 4;
const VAR_PLAY_POSITIONED = 5;

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
		this._coin_toys = [];
		// 2026-06-27, Composer: arcade owns ArcadeSound lifecycle [plarc5]
		this._sound = new ArcadeSound(this._core).init();
		this._positions_applied = false;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
		this._core.scene.environment.floorstyle("floor", 0xffffff);
		this._core.scene.environment.shadowstyle(0x0, 0.5);

		this._floor_index = this._core.itembox.spawn("floor_item");
		this._positions_applied = false;
		this._coin_toys = [];

		this._core.render.camera.position.set(0, 10, 2);
		this._core.render.camera.lookAt(0, 0, 0);

		// 2026-06-26, Composer: arcade coin stack spawn loop [plstk1]
		for (let i = 0; i < COIN_STACK_COUNT; i++) {
			this._register_coin(this._core.toybox.spawn("coin_a_toy", true), i, 4, -2);
		}
		// 2026-06-26, Composer: arcade coin_b stack spawn loop [plstkb1]
		for (let i = 0; i < COIN_STACK_COUNT; i++) {
			this._register_coin(this._core.toybox.spawn("coin_b_toy", true), i, 4, -1);
		}
		// 2026-06-26, Composer: arcade coin_c stack spawn loop [plstkc1]
		for (let i = 0; i < COIN_STACK_COUNT; i++) {
			this._register_coin(this._core.toybox.spawn("coin_c_toy", true), i, 4, 0);
		}
		// 2026-06-26, Composer: arcade dice_a stack spawn loop [plstkdc1]
		for (let i = 0; i < DICE_STACK_COUNT; i++) {
			this._register_coin(this._core.toybox.spawn("dice_a_toy", true), i, 4, 1);
		}

		// 2026-06-26, Composer: coin placement via toybox.on_toyupdate [plstk2]
		this._core.toybox.on_toypreupdate = null;
		this._core.toybox.on_toyupdate = this._toyupdate.bind(this);
		this._sound.start();
	}

	/**
	 * @param {number} _dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(_dt, _rdt) {
		this._apply_floor_position();
	}

	/** @returns {void} */
	stop() {
		this._sound.stop();
		this._core.toybox.on_toyupdate = null;
		this._core.toybox.on_toypreupdate = null;

		for (const toy_index of this._coin_toys) {
			this._core.toybox.despawn(toy_index, true);
		}
		this._coin_toys = [];

		if (this._floor_index != null) {
			this._core.itembox.despawn(this._floor_index, true);
			this._floor_index = null;
		}

		this._core.scene.environment.floorstyle(null, 0xffffff);
		this._positions_applied = false;
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

	/**
	 * @param {number|null} toyIndex
	 * @param {number} stackIndex
	 * @param {number} x
	 * @param {number} z
	 * @returns {void}
	 */
	_register_coin(toyIndex, stackIndex, x, z) {
		// 2026-06-26, Composer: coin stack metadata on toy blackboard [plstk4]
		if (toyIndex == null) {
			return;
		}
		this._coin_toys.push(toyIndex);
		const bb = this._core.toybox.blackboard;
		bb.write(toyIndex, BB_KEY_PLAY, VAR_PLAY_STACK_INDEX, stackIndex);
		bb.write_i16(toyIndex, BB_KEY_PLAY, VAR_PLAY_BASE_X, x);
		bb.write_i16(toyIndex, BB_KEY_PLAY, VAR_PLAY_BASE_Z, z);
		bb.write(toyIndex, BB_KEY_PLAY, VAR_PLAY_POSITIONED, 0);
	}

	/** @returns {void} */
	_toyupdate(_dt, toyIndex) {
		// 2026-06-26, Composer: coin placement via toybox.on_toyupdate [plstk2]
		const bb = this._core.toybox.blackboard;
		if (bb.get_slot(toyIndex, BB_KEY_PLAY) === BB_INVALID) {
			return;
		}
		if (bb.read(toyIndex, BB_KEY_PLAY, VAR_PLAY_POSITIONED)) {
			return;
		}

		const item_index = this._core.toybox.get_item_index(toyIndex);
		const entity = this._core.scene.get_itementity(item_index);
		if (!entity) {
			return;
		}

		const stackIndex = bb.read(toyIndex, BB_KEY_PLAY, VAR_PLAY_STACK_INDEX);
		const baseX = bb.read_i16(toyIndex, BB_KEY_PLAY, VAR_PLAY_BASE_X) / 10;
		const baseZ = bb.read_i16(toyIndex, BB_KEY_PLAY, VAR_PLAY_BASE_Z) / 10;
		const y = COIN_STEP * 0.5 + stackIndex * COIN_STEP;
		this._core.scene.set_itemposition(
			item_index,
			baseX + Math.random() * 0.1,
			y,
			baseZ + Math.random() * 0.1,
		);
		bb.write(toyIndex, BB_KEY_PLAY, VAR_PLAY_POSITIONED, 1);
	}
}

export default Arcade;
// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
// 2026-06-26, Composer: arcade floor pose via vec3 and quat [plarc2]
// 2026-06-26, Composer: arcade spawn coin_a toy item body [plarc4]
// 2026-06-26, Composer: arcade coin stack spawn loop [plstk1]
// 2026-06-26, Composer: coin placement via toybox.on_toyupdate [plstk2]
// 2026-06-26, Composer: arcade coin_b stack spawn loop [plstkb1]
// 2026-06-26, Composer: coin stack metadata on toy blackboard [plstk4]
// 2026-06-26, Composer: VAR_PLAY field offsets owned by arcade [plfld1]
// 2026-06-26, Composer: arcade coin_c stack spawn loop [plstkc1]
// 2026-06-26, Composer: arcade dice_a stack spawn loop [plstkdc1]
// 2026-06-27, Composer: arcade owns ArcadeSound lifecycle [plarc5]
