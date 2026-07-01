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
		/** @type {number|null} */
		this._achievement_obtain_id = null;
		/** @type {Set<number>} */
		this._object_toys = new Set();
		this._object_count = 0;
		/** @type {Record<number, string>} */
		this._toy_key_by_id = {};
		/** @type {Record<string, { key: string, mode: string, type: string, condition: string, target: number, state: "locked"|"open"|"achieved"|"obtained", current: number }>} */
		this._achievements = {};
		/** @type {number|null} */
		this._arcader_c_toy = null;
		this._build_toy_key_by_id();
		this._build_achievements();
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-07-01, GPT-5.5: achievements listen to arcade object counts [achreg1]
		// 2026-07-01, Codex 5.3: parent achievements emit progress snapshots [achprg1]
		this._object_registered_id = this._core.eventsbus.on(
			"arcade.object_registered",
			this._on_object_registered.bind(this),
		);
		this._object_despawned_id = this._core.eventsbus.on(
			"arcade.object_despawned",
			this._on_object_despawned.bind(this),
		);
		this._achievement_obtain_id = this._core.eventsbus.on(
			"arcade.achievement.obtain",
			this._on_achievement_obtain.bind(this),
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
		if (this._achievement_obtain_id != null) {
			this._core.eventsbus.off(this._achievement_obtain_id);
			this._achievement_obtain_id = null;
		}
		if (this._arcader_c_toy != null) {
			this._core.toybox.despawn(this._arcader_c_toy, true);
			this._arcader_c_toy = null;
		}
		this._object_toys.clear();
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
		if (this._object_toys.has(toyIndex)) {
			return;
		}
		this._object_toys.add(toyIndex);
		this._object_count = this._object_toys.size;
		if (this._arcader_c_toy == null && toyIndex !== this._arcader_c_toy) {
			this._spawn_arcader_c();
		}
		this._emit_achievement_progress();
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_object_despawned(toyIndex) {
		this._object_toys.delete(toyIndex);
		this._object_count = this._object_toys.size;
		if (toyIndex === this._arcader_c_toy) {
			this._arcader_c_toy = null;
		}
		this._emit_achievement_progress();
	}

	/**
	 * @param {{ key?: string }} payload
	 * @returns {void}
	 */
	_on_achievement_obtain(payload) {
		const key = payload?.key;
		if (!key) {
			return;
		}
		const achievement = this._achievements[key];
		if (!achievement || achievement.state === "locked") {
			return;
		}
		achievement.state = "obtained";
		this._emit_achievement_progress();
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

	/** @returns {void} */
	_build_toy_key_by_id() {
		this._toy_key_by_id = {};
		const entry = this._core.db.get("toys");
		if (!entry) {
			return;
		}
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (conf?.id != null) {
				this._toy_key_by_id[conf.id] = key;
			}
		}
	}

	/** @returns {void} */
	_build_achievements() {
		this._achievements = {};
		const entry = this._core.db.get("achievements");
		if (!entry) {
			return;
		}
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (!conf) {
				continue;
			}
			const target = Number(conf.target ?? 0);
			this._achievements[key] = {
				key,
				mode: conf.mode ?? "collect",
				type: conf.type ?? "",
				condition: conf.condition ?? ">=",
				target: Number.isFinite(target) ? target : 0,
				state: conf.state ?? "open",
				current: 0,
			};
		}
	}

	/**
	 * @param {number} toyIndex
	 * @returns {string|null}
	 */
	_toy_key(toyIndex) {
		const conf = this._core.toybox.get_toyconf(toyIndex);
		if (conf?.id == null) {
			return null;
		}
		return this._toy_key_by_id[conf.id] ?? null;
	}

	/**
	 * @param {string} type
	 * @returns {number}
	 */
	_count_on_scene(type) {
		if (!type) {
			return this._object_count;
		}
		let count = 0;
		for (const toyIndex of this._object_toys) {
			if (this._toy_key(toyIndex) === type) {
				count++;
			}
		}
		return count;
	}

	/** @returns {void} */
	_emit_achievement_progress() {
		for (const key in this._achievements) {
			const achievement = this._achievements[key];
			if (achievement.state === "locked") {
				continue;
			}
			const current = achievement.mode === "collect"
				? this._count_on_scene(achievement.type)
				: 0;
			achievement.current = current;
			if (achievement.state !== "obtained") {
				// 2026-07-01, Codex 5.3: evaluate achievement target by db condition [achcnd1]
				achievement.state = this._is_target_reached(
					current,
					achievement.target,
					achievement.condition,
				) ? "achieved" : "open";
			}
			this._core.eventsbus.emit("arcade.achievement.progress", {
				key: achievement.key,
				mode: achievement.mode,
				type: achievement.type,
				current: achievement.current,
				target: achievement.target,
				state: achievement.state,
			});
		}
	}

	/**
	 * @param {number} current
	 * @param {number} target
	 * @param {string} condition
	 * @returns {boolean}
	 */
	_is_target_reached(current, target, condition) {
		switch (condition) {
			case ">":
				return current > target;
			case "<":
				return current < target;
			case "<=":
				return current <= target;
			case "==":
			case "=":
				return current === target;
			case "!=":
				return current !== target;
			case ">=":
			default:
				return current >= target;
		}
	}
}

export default ArcadeAchievements;
// 2026-07-01, GPT-5.5: achievements listen to arcade object counts [achreg1]
// 2026-07-01, GPT-5.5: arcader_c spawned through achievements [achspn1]
// 2026-07-01, Codex 5.3: achievements manager owns arcader_c spawn [arccsp1]
// 2026-07-01, Codex 5.3: parent achievements emit progress snapshots [achprg1]
// 2026-07-01, Codex 5.3: evaluate achievement target by db condition [achcnd1]
