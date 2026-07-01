/** @namespace ty */
// Purpose: arcade achievement state tracks live registered toys and owns reward spawns.

const ARCADER_B_TOY_KEY = "arcader_b_toy";
const ARCADER_B_X = -4;
const ARCADER_B_Y = 3;
const ARCADER_B_Z = 0;

/**
 * @class ArcadeAchievements
 * @memberof pb.play
 */
class ArcadeAchievements {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {import("./arcade.js").default} arcade
	 */
	constructor(core, arcade) {
		this._core = core;
		this._arcade = arcade;
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {number|null} */
		this._object_registered_id = null;
		/** @type {number|null} */
		this._object_despawned_id = null;
		this._object_count = 0;
		/** @type {number|null} */
		this._arcader_b_toy = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-07-01, GPT-5.5: achievements listen to arcade object counts [achreg1]
		this._object_registered_id = this._core.eventsbus.on(
			"arcade.object_registered",
			this._on_object_registered.bind(this),
		);
		this._object_despawned_id = this._core.eventsbus.on(
			"arcade.object_despawned",
			this._on_object_despawned.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._object_registered_id != null) {
			this._core.eventsbus.off(this._object_registered_id);
			this._object_registered_id = null;
		}
		if (this._object_despawned_id != null) {
			this._core.eventsbus.off(this._object_despawned_id);
			this._object_despawned_id = null;
		}
		if (this._arcader_b_toy != null) {
			this._core.toybox.despawn(this._arcader_b_toy, true);
			this._arcader_b_toy = null;
		}
		this._object_count = 0;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/** @returns {void} */
	step() {}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_object_registered(toyIndex) {
		this._object_count++;
		if (this._arcader_b_toy == null && toyIndex !== this._arcader_b_toy) {
			this._spawn_arcader_b();
		}
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_object_despawned(toyIndex) {
		this._object_count = Math.max(0, this._object_count - 1);
		if (toyIndex === this._arcader_b_toy) {
			this._arcader_b_toy = null;
		}
	}

	/** @returns {void} */
	_spawn_arcader_b() {
		const toyIndex = this._core.toybox.spawn(ARCADER_B_TOY_KEY, true);
		if (toyIndex == null) {
			return;
		}

		this._arcader_b_toy = toyIndex;
		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		this._core.scene.set_itemposition(
			itemIndex,
			ARCADER_B_X,
			ARCADER_B_Y,
			ARCADER_B_Z,
		);
		// 2026-07-01, GPT-5.5: arcader_b spawned through achievements [achspn1]
		this._arcade.register_object(toyIndex);
	}
}

export default ArcadeAchievements;
// 2026-07-01, GPT-5.5: achievements listen to arcade object counts [achreg1]
// 2026-07-01, GPT-5.5: arcader_b spawned through achievements [achspn1]
