/** @namespace ty */
// Purpose: arcade achievement state tracks live registered toys and owns reward spawns.

const ARCADER_C_TOY_KEY = "arcader_c_toy";
const ARCADER_C_X = -6;
const ARCADER_C_Y = 3;
const ARCADER_C_Z = -3;

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
		this._arcader_c_toy = null;
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
		if (this._arcader_c_toy != null) {
			this._core.toybox.despawn(this._arcader_c_toy, true);
			this._arcader_c_toy = null;
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
		if (this._arcader_c_toy == null && toyIndex !== this._arcader_c_toy) {
			this._spawn_arcader_c();
		}
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_object_despawned(toyIndex) {
		this._object_count = Math.max(0, this._object_count - 1);
		if (toyIndex === this._arcader_c_toy) {
			this._arcader_c_toy = null;
		}
	}

	/** @returns {void} */
	_spawn_arcader_c() {
		const toyIndex = this._core.toybox.spawn(ARCADER_C_TOY_KEY, true);
		if (toyIndex == null) {
			return;
		}

		this._arcader_c_toy = toyIndex;
		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		// 2026-07-01, Codex 5.3: achievements manager owns arcader_c spawn [arccsp1]
		this._core.scene.set_itemposition(
			itemIndex,
			ARCADER_C_X,
			ARCADER_C_Y,
			ARCADER_C_Z,
		);
		// 2026-07-01, GPT-5.5: arcader_c spawned through achievements [achspn1]
		this._arcade.register_object(toyIndex);
	}
}

export default ArcadeAchievements;
// 2026-07-01, GPT-5.5: achievements listen to arcade object counts [achreg1]
// 2026-07-01, GPT-5.5: arcader_c spawned through achievements [achspn1]
// 2026-07-01, Codex 5.3: achievements manager owns arcader_c spawn [arccsp1]
