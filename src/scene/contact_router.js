/** @namespace ty */
// 2026-06-29, Composer: ContactRouter EventQueue collision drain [ctrt1]
import { VAR_BODY_ID, VAR_TOY_INDEX, TOY_INDEX_INVALID } from "./itembox.js";

export const CONTACT_PHASE_BEGIN = 1;
export const CONTACT_PHASE_END = 2;

/**
 * @class ContactRouter
 * @memberof pb.scene
 */
class ContactRouter {
	/**
	 * @param {import("../core/eventsbus.js").default} eventsbus
	 * @param {import("../core/physics.js").default} physics
	 * @param {import("./itembox.js").default} itembox
	 * @param {import("./toybox.js").default} toybox
	 */
	constructor(eventsbus, physics, itembox, toybox) {
		this._eventsbus = eventsbus;
		this._physics = physics;
		this._itembox = itembox;
		this._toybox = toybox;
		/** @type {Set<number>} */
		this._watched = new Set();
		this._emit = {
			phase: 0,
			toyIndex: 0,
			otherToyIndex: TOY_INDEX_INVALID,
			collider1: 0,
			collider2: 0,
			started: false,
		};
		physics.set_collision_handler(this._on_collision.bind(this));
	}

	/**
	 * @param {number} toyIndex
	 * @returns {import("@dimforge/rapier3d").RigidBody|null}
	 */
	_body_for_toy(toyIndex) {
		const item_index = this._toybox.get_item_index(toyIndex);
		const body_id = this._itembox.mempool.read_ui16(item_index, VAR_BODY_ID);
		return this._physics.bodylist[body_id] ?? null;
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	watch(toyIndex) {
		const body = this._body_for_toy(toyIndex);
		if (!body) {
			return;
		}

		this._watched.add(toyIndex);
		// 2026-06-29, Composer: bounds bodies need events on all colliders [ctrt2]
		this._physics.set_body_collision_events(body, true);
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	unwatch(toyIndex) {
		const body = this._body_for_toy(toyIndex);
		if (body) {
			this._physics.set_body_collision_events(body, false);
		}
		this._watched.delete(toyIndex);
	}

	/** @returns {void} */
	dispose() {
		for (const toyIndex of [...this._watched]) {
			this.unwatch(toyIndex);
		}
		this._physics.set_collision_handler(null);
	}

	/**
	 * @param {string|number} gameId
	 * @returns {number|undefined}
	 */
	_resolve_toy_index(gameId) {
		const meta = this._physics.bodyMeta[gameId];
		if (meta?.itemIndex == null) {
			return undefined;
		}
		const toyIndex = this._itembox.mempool.read_ui16(meta.itemIndex, VAR_TOY_INDEX);
		if (toyIndex === TOY_INDEX_INVALID) {
			return undefined;
		}
		return toyIndex;
	}

	/**
	 * @param {boolean} started
	 * @param {number} h1
	 * @param {number} h2
	 * @returns {void}
	 */
	_on_collision(started, h1, h2) {
		if (!this._eventsbus.has("scene.contact")) {
			return;
		}

		const physics = this._physics;
		const g1 = physics.colliderToGameId.get(h1);
		const g2 = physics.colliderToGameId.get(h2);
		const toy1 = g1 != null ? this._resolve_toy_index(g1) : undefined;
		const toy2 = g2 != null ? this._resolve_toy_index(g2) : undefined;

		if (toy1 === undefined && toy2 === undefined) {
			return;
		}

		let primary;
		let other;
		if (toy1 !== undefined && toy2 !== undefined) {
			if (toy1 <= toy2) {
				primary = toy1;
				other = toy2;
			} else {
				primary = toy2;
				other = toy1;
			}
		} else if (toy1 !== undefined) {
			primary = toy1;
			other = TOY_INDEX_INVALID;
		} else {
			primary = toy2;
			other = TOY_INDEX_INVALID;
		}

		const emit = this._emit;
		emit.phase = started ? CONTACT_PHASE_BEGIN : CONTACT_PHASE_END;
		emit.collider1 = h1;
		emit.collider2 = h2;
		emit.started = started;
		emit.toyIndex = primary;
		emit.otherToyIndex = other;
		this._eventsbus.emit("scene.contact", emit);
	}
}

export default ContactRouter;
// 2026-06-29, Composer: ContactRouter EventQueue collision drain [ctrt1]
// 2026-06-29, Composer: bounds bodies need events on all colliders [ctrt2]
