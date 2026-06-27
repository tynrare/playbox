/** @namespace ty */
// Purpose: arcade contact sfx — kind map, impact volume, play API.

import { TOY_INDEX_INVALID } from "../scene/itembox.js";
import { VAR_TOY_DB_ID } from "../scene/toybox.js";

// 2026-06-27, Composer: toy db id to contact sfx kind map [plsfx1]
/** @type {ReadonlyMap<number, string>} */
const TOY_CONTACT_KIND_BY_DB_ID = new Map([
	[3, "coin"],
	[4, "coin"],
	[5, "coin"],
	[6, "dice"],
	[7, "weight"],
]);
/** @type {Readonly<Record<string, string>>} */
const CONTACT_SFX_BY_KIND = {
	coin: "chips-collide-2",
	dice: "impactWood_light_000",
	weight: "impactPunch_heavy_000",
};
/** @type {Readonly<string[]>} */
const CONTACT_KIND_PRIORITY = ["dice", "coin"];
// 2026-06-27, Composer: contact approach speed to sfx volume [plimp1]
const CONTACT_SPEED_MIN = 1.0;
const CONTACT_SPEED_MAX = 16.0;
const CONTACT_VOL_MIN = 0.10;
const CONTACT_VOL_MAX = 1.0;

/**
 * @class ArcadeSound
 * @memberof pb.play
 */
class ArcadeSound {
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
		return this;
	}

	/** @returns {void} */
	start() {}

	/** @returns {void} */
	stop() {}

	/**
	 * @param {number} toyIndex
	 * @returns {string|null}
	 */
	_toy_contact_kind(toyIndex) {
		if (toyIndex === TOY_INDEX_INVALID) {
			return null;
		}
		const id = this._core.toybox.mempool.read_ui16(toyIndex, VAR_TOY_DB_ID);
		return TOY_CONTACT_KIND_BY_DB_ID.get(id) ?? null;
	}

	/**
	 * @param {number} toyIndex
	 * @param {number} otherToyIndex
	 * @returns {string|null}
	 */
	_resolve_contact_sfx(toyIndex, otherToyIndex) {
		const kinds = new Set([
			this._toy_contact_kind(toyIndex),
			this._toy_contact_kind(otherToyIndex),
		]);
		for (let i = 0; i < CONTACT_KIND_PRIORITY.length; i++) {
			const kind = CONTACT_KIND_PRIORITY[i];
			if (kinds.has(kind)) {
				return CONTACT_SFX_BY_KIND[kind];
			}
		}
		return null;
	}

	/**
	 * @param {number} speed
	 * @returns {number|null}
	 */
	_impact_volume(speed) {
		if (speed < CONTACT_SPEED_MIN) {
			return null;
		}
		const span = CONTACT_SPEED_MAX - CONTACT_SPEED_MIN;
		const t =
			span > 0
				? Math.min(1, Math.max(0, (speed - CONTACT_SPEED_MIN) / span))
				: 1;
		return CONTACT_VOL_MIN + t * (CONTACT_VOL_MAX - CONTACT_VOL_MIN);
	}

	/**
	 * @param {number} toyIndex
	 * @param {number} otherToyIndex
	 * @param {number} speed
	 * @returns {void}
	 */
	// 2026-06-27, Composer: contact sfx play API called from arcade [plsnd3]
	play_contact(toyIndex, otherToyIndex, speed) {
		const sfx = this._resolve_contact_sfx(toyIndex, otherToyIndex);
		if (sfx == null) {
			return;
		}
		const vol = this._impact_volume(speed);
		if (vol == null) {
			return;
		}
		this._core.scene.audio.play(sfx, vol);
	}
}

export default ArcadeSound;
// 2026-06-27, Composer: fix listener id vs handler name clash [plsnd2]
// 2026-06-27, Composer: arcade sound scene.contact listener [plsnd1]
// 2026-06-27, Composer: toy db id to contact sfx kind map [plsfx1]
// 2026-06-27, Composer: contact approach speed to sfx volume [plimp1]
// 2026-06-27, Composer: contact sfx play API called from arcade [plsnd3]
