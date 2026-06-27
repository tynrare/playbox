/** @namespace ty */
// Purpose: arcade scene.contact sfx — kind map, impact volume, eventsbus wiring.

import { TOY_INDEX_INVALID } from "../scene/itembox.js";
import { CONTACT_PHASE_BEGIN } from "../scene/contact_router.js";
import { VAR_TOY_DB_ID } from "../scene/toybox.js";

// 2026-06-27, Composer: toy db id to contact sfx kind map [plsfx1]
/** @type {ReadonlyMap<number, string>} */
const TOY_CONTACT_KIND_BY_DB_ID = new Map([
	[3, "coin"],
	[4, "coin"],
	[5, "coin"],
	[6, "dice"],
]);
/** @type {Readonly<Record<string, string>>} */
const CONTACT_SFX_BY_KIND = {
	coin: "chips-collide-2",
	dice: "impactWood_light_000",
};
/** @type {Readonly<string[]>} */
const CONTACT_KIND_PRIORITY = ["dice", "coin"];
// 2026-06-27, Composer: contact approach speed to sfx volume [plimp1]
const CONTACT_SPEED_MIN = 0.5;
const CONTACT_SPEED_MAX = 4.0;
const CONTACT_VOL_MIN = 0.15;
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
		/** @type {number|null} */
		this._scene_contact_id = null;
		return this;
	}

	/** @returns {void} */
	// 2026-06-27, Composer: fix listener id vs handler name clash [plsnd2]
	start() {
		this._scene_contact_id = this._core.eventsbus.on(
			"scene.contact",
			this._on_scene_contact.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._scene_contact_id != null) {
			this._core.eventsbus.off(this._scene_contact_id);
			this._scene_contact_id = null;
		}
	}

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
	 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.Contact} contact
	 * @returns {number}
	 */
	_contact_approach_speed(contact) {
		const b1 = contact.getShape1().getRigidBody();
		const b2 = contact.getShape2().getRigidBody();
		const n = contact.getManifold().getNormal();
		const v1 = b1.getLinearVelocity();
		const v2 = b2.getLinearVelocity();
		const relN =
			(v1.x - v2.x) * n.x +
			(v1.y - v2.y) * n.y +
			(v1.z - v2.z) * n.z;
		return Math.max(0, -relN);
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
	 * @param {{ phase: number, toyIndex: number, otherToyIndex: number, contact: import("../lib/OimoPhysics.js").oimo.dynamics.Contact }} payload
	 * @returns {void}
	 */
	_on_scene_contact(payload) {
		if (payload.phase !== CONTACT_PHASE_BEGIN) {
			return;
		}
		const sfx = this._resolve_contact_sfx(
			payload.toyIndex,
			payload.otherToyIndex,
		);
		if (sfx == null) {
			return;
		}
		const speed = this._contact_approach_speed(payload.contact);
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
