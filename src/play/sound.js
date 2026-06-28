/** @namespace ty */
// Purpose: arcade contact sfx — tag kind map, impact volume, play API.

import { TOY_INDEX_INVALID } from "../scene/itembox.js";

/** @type {Readonly<Record<string, string>>} */
const CONTACT_SFX_BY_KIND = {
	coin: "coindrop",
	dice: "impactWood_light_000",
	weight: "impactPunch_heavy_000",
};
/** @type {Readonly<string[]>} */
const CONTACT_KIND_PRIORITY = ["dice", "coin", "weight"];
// 2026-06-27, Composer: contact approach speed to sfx volume [plimp1]
const CONTACT_SPEED_MIN = 2.0;
const CONTACT_SPEED_MAX = 32.0;
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
		// 2026-06-28, Composer: contact sfx kind from toy tags [plsfx2]
		if (toyIndex === TOY_INDEX_INVALID) {
			return null;
		}
		const toybox = this._core.toybox;
		for (let i = 0; i < CONTACT_KIND_PRIORITY.length; i++) {
			const kind = CONTACT_KIND_PRIORITY[i];
			if (toybox.has_tag(toyIndex, kind)) {
				return kind;
			}
		}
		return null;
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
// 2026-06-27, Composer: contact approach speed to sfx volume [plimp1]
// 2026-06-27, Composer: contact sfx play API called from arcade [plsnd3]
// 2026-06-28, Composer: contact sfx kind from toy tags [plsfx2]
