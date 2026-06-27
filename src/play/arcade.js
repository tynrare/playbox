/** @namespace ty */

// 2026-06-26, Composer: arcade play stub floor plane only [plarc1]
// 2026-06-26, Composer: arcade floor pose via vec3 and quat [plarc2]
// 2026-06-26, Composer: arcade spawn coin_a toy item body [plarc4]

import { cache } from "../math.js";
import { BB_KEY_PLAY } from "../scene/blackboard.js";
import { CONTACT_PHASE_BEGIN } from "../scene/contact_router.js";
import { TOY_INDEX_INVALID } from "../scene/itembox.js";
import { VAR_TOY_DB_ID } from "../scene/toybox.js";
import ArcadeSound from "./sound.js";
import { contactApproachSpeed, quake, QUAKE_SPEED_MIN } from "./shenanigans.js";

const COIN_A_COUNT = 3;
const COIN_B_COUNT = 0;
const COIN_C_COUNT = 0;
const DICE_COUNT = 1;
const WEIGHT_Y = 4;
const WEIGHT_A_TOY_DB_ID = 7;
// 2026-06-26, Composer: arcade per-type spawn counts [plcnt2]
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
		/** @type {number|null} */
		this._scene_contact_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-27, Composer: arcade immediate spawn direct position on start [plarc6]
		this._core.scene.environment.floorstyle("floor", 0xffffff);
		this._core.scene.environment.shadowstyle(0x0, 0.5);

		this._floor_index = this._core.itembox.spawn("floor_item", true);
		if (this._floor_index != null) {
			this._core.scene.set_itemposition(
				this._floor_index,
				cache.vec3.v0.set(0, -0.05, 0),
			);
		}
		this._coin_toys = [];

		this._core.render.camera.position.set(0, 10, 2);
		this._core.render.camera.lookAt(0, 0, 0);

		// 2026-06-26, Composer: arcade coin stack spawn loop [plstk1]
		for (let i = 0; i < COIN_A_COUNT; i++) {
			const y = COIN_STEP * 0.5 + i * COIN_STEP;
			this._register_coin(this._core.toybox.spawn("coin_a_toy", true), i, 4, y, -2);
		}
		// 2026-06-26, Composer: arcade coin_b stack spawn loop [plstkb1]
		for (let i = 0; i < COIN_B_COUNT; i++) {
			const y = COIN_STEP * 0.5 + i * COIN_STEP;
			this._register_coin(this._core.toybox.spawn("coin_b_toy", true), i, 4, y, -1);
		}
		// 2026-06-26, Composer: arcade coin_c stack spawn loop [plstkc1]
		for (let i = 0; i < COIN_C_COUNT; i++) {
			const y = COIN_STEP * 0.5 + i * COIN_STEP;
			this._register_coin(this._core.toybox.spawn("coin_c_toy", true), i, 4, y, 0);
		}
		// 2026-06-26, Composer: arcade dice_a stack spawn loop [plstkdc1]
		for (let i = 0; i < DICE_COUNT; i++) {
			const y = COIN_STEP * 0.5 + i * COIN_STEP;
			this._register_coin(this._core.toybox.spawn("dice_a_toy", true), i, 4, y, 1);
		}

		// 2026-06-27, Composer: arcade spawn weight_a at center [plwgt1]
		const weight_toy = this._core.toybox.spawn("weight_a_toy", true);
		if (weight_toy != null) {
			this._coin_toys.push(weight_toy);
			const item_index = this._core.toybox.get_item_index(weight_toy);
			this._core.scene.set_itemposition(item_index, 0, WEIGHT_Y, 0);
		}

		// 2026-06-27, Composer: arcade scene.contact handler owns collisions [plcnt3]
		this._scene_contact_id = this._core.eventsbus.on(
			"scene.contact",
			this._on_scene_contact.bind(this),
		);
		this._sound.start();
	}

	/**
	 * @param {number} _dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(_dt, _rdt) {}

	/** @returns {void} */
	stop() {
		if (this._scene_contact_id != null) {
			this._core.eventsbus.off(this._scene_contact_id);
			this._scene_contact_id = null;
		}
		this._sound.stop();

		for (const toy_index of this._coin_toys) {
			this._core.toybox.despawn(toy_index, true);
		}
		this._coin_toys = [];

		if (this._floor_index != null) {
			this._core.itembox.despawn(this._floor_index, true);
			this._floor_index = null;
		}

		this._core.scene.environment.floorstyle(null, 0xffffff);
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @param {number|null} toyIndex
	 * @param {number} stackIndex
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @returns {void}
	 */
	// 2026-06-27, Composer: register coin y passed from spawn loop [plreg1]
	_register_coin(toyIndex, stackIndex, x, y, z) {
		// 2026-06-27, Composer: arcade immediate spawn direct position on start [plarc6]
		if (toyIndex == null) {
			return;
		}
		this._coin_toys.push(toyIndex);
		const bb = this._core.toybox.blackboard;
		bb.write(toyIndex, BB_KEY_PLAY, VAR_PLAY_STACK_INDEX, stackIndex);
		bb.write_i16(toyIndex, BB_KEY_PLAY, VAR_PLAY_BASE_X, x);
		bb.write_i16(toyIndex, BB_KEY_PLAY, VAR_PLAY_BASE_Z, z);

		const item_index = this._core.toybox.get_item_index(toyIndex);
		this._core.scene.set_itemposition(
			item_index,
			x + Math.random() * 0.1,
			y,
			z + Math.random() * 0.1,
		);
		bb.write(toyIndex, BB_KEY_PLAY, VAR_PLAY_POSITIONED, 1);
	}

	/**
	 * @param {number} weightToyIndex
	 * @returns {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody|null}
	 */
	_weight_body(weightToyIndex) {
		const item_index = this._core.toybox.get_item_index(weightToyIndex);
		return this._core.scene.get_itembody(item_index);
	}

	/**
	 * @param {number} toyIndex
	 * @returns {boolean}
	 */
	_is_weight_a(toyIndex) {
		if (toyIndex === TOY_INDEX_INVALID) {
			return false;
		}
		const id = this._core.toybox.mempool.read_ui16(toyIndex, VAR_TOY_DB_ID);
		return id === WEIGHT_A_TOY_DB_ID;
	}

	/**
	 * @param {{ phase: number, toyIndex: number, otherToyIndex: number, contact: import("../lib/OimoPhysics.js").oimo.dynamics.Contact }} payload
	 * @returns {void}
	 */
	_on_scene_contact(payload) {
		// 2026-06-27, Composer: arcade scene.contact handler owns collisions [plcnt3]
		if (payload.phase !== CONTACT_PHASE_BEGIN) {
			return;
		}

		const speed = contactApproachSpeed(payload.contact);
		const weightToy = this._is_weight_a(payload.toyIndex)
			? payload.toyIndex
			: this._is_weight_a(payload.otherToyIndex)
				? payload.otherToyIndex
				: TOY_INDEX_INVALID;

		if (weightToy !== TOY_INDEX_INVALID && speed >= QUAKE_SPEED_MIN) {
			// 2026-06-27, Composer: weight drop quake delegated to shenanigans [plqke2]
			const weightBody = this._weight_body(weightToy);
			const world = this._core.physics.world;
			if (weightBody != null && world != null) {
				quake(world, payload.contact, weightBody);
			}
		}

		this._sound.play_contact(payload.toyIndex, payload.otherToyIndex, speed);
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
// 2026-06-26, Composer: arcade per-type spawn counts [plcnt2]
// 2026-06-27, Composer: arcade immediate spawn direct position on start [plarc6]
// 2026-06-27, Composer: arcade spawn weight_a at center [plwgt1]
// 2026-06-27, Composer: arcade scene.contact handler owns collisions [plcnt3]
// 2026-06-27, Composer: register coin y passed from spawn loop [plreg1]
// 2026-06-27, Composer: weight drop quake delegated to shenanigans [plqke2]
