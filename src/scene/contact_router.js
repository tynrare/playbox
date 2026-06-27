/** @namespace ty */
// 2026-06-26, Composer: ContactRouter Oimo contact wiring for toys [ctrt1]
import { oimo } from "../lib/OimoPhysics.js";
import { VAR_BODY_ID, VAR_TOY_INDEX, TOY_INDEX_INVALID } from "./itembox.js";

export const CONTACT_PHASE_BEGIN = 1;
export const CONTACT_PHASE_END = 2;

/**
 * @extends {oimo.dynamics.callback.ContactCallback}
 */
class RouterContactCallback extends oimo.dynamics.callback.ContactCallback {
	/**
	 * @param {ContactRouter} router
	 */
	constructor(router) {
		super();
		this._router = router;
	}

	/**
	 * @param {oimo.dynamics.Contact} contact
	 * @returns {void}
	 */
	beginContact(contact) {
		this._router._on_contact(CONTACT_PHASE_BEGIN, contact);
	}

	/**
	 * @param {oimo.dynamics.Contact} contact
	 * @returns {void}
	 */
	endContact(contact) {
		this._router._on_contact(CONTACT_PHASE_END, contact);
	}
}

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
		this._callback = new RouterContactCallback(this);
		this._emit = {
			phase: 0,
			toyIndex: 0,
			otherToyIndex: TOY_INDEX_INVALID,
			contact: /** @type {oimo.dynamics.Contact|null} */ (null),
		};
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	watch(toyIndex) {
		const item_index = this._toybox.get_item_index(toyIndex);
		const body_id = this._itembox.mempool.read_ui16(item_index, VAR_BODY_ID);
		const body = this._physics.bodylist[body_id];
		if (!body) {
			return;
		}

		this._watched.add(toyIndex);
		this._set_body_callback(body, this._callback);
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	unwatch(toyIndex) {
		const item_index = this._toybox.get_item_index(toyIndex);
		const body_id = this._itembox.mempool.read_ui16(item_index, VAR_BODY_ID);
		const body = this._physics.bodylist[body_id];
		if (body) {
			this._set_body_callback(body, null);
		}
		this._watched.delete(toyIndex);
	}

	/** @returns {void} */
	dispose() {
		for (const toyIndex of [...this._watched]) {
			this.unwatch(toyIndex);
		}
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @returns {number|undefined}
	 */
	_resolve_toy_index(body) {
		// 2026-06-26, Composer: body userData itemIndex to toy via VAR_TOY_INDEX [ctrt2]
		const ud = body.userData;
		if (ud == null || ud.itemIndex == null) {
			return undefined;
		}
		const toyIndex = this._itembox.mempool.read_ui16(ud.itemIndex, VAR_TOY_INDEX);
		if (toyIndex === TOY_INDEX_INVALID) {
			return undefined;
		}
		return toyIndex;
	}

	/**
	 * @param {number} phase
	 * @param {oimo.dynamics.Contact} contact
	 * @returns {void}
	 */
	_on_contact(phase, contact) {
		if (!this._eventsbus.has("scene.contact")) {
			return;
		}

		const b1 = contact.getShape1().getRigidBody();
		const b2 = contact.getShape2().getRigidBody();
		const toy1 = this._resolve_toy_index(b1);
		const toy2 = this._resolve_toy_index(b2);

		if (toy1 === undefined && toy2 === undefined) {
			return;
		}

		let primary;
		let other;
		if (toy1 !== undefined && toy2 !== undefined) {
			// 2026-06-27, Composer: canonical pair indices without dropping contacts [ctrt4]
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
		emit.phase = phase;
		emit.contact = contact;
		emit.toyIndex = primary;
		emit.otherToyIndex = other;
		this._eventsbus.emit("scene.contact", emit);
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @param {oimo.dynamics.callback.ContactCallback|null} callback
	 * @returns {void}
	 */
	_set_body_callback(body, callback) {
		let shape = body.getShapeList();
		while (shape != null) {
			shape.setContactCallback(callback);
			shape = shape.getNext();
		}
	}
}

export default ContactRouter;
// 2026-06-26, Composer: ContactRouter Oimo contact wiring for toys [ctrt1]
// 2026-06-26, Composer: body userData itemIndex to toy via VAR_TOY_INDEX [ctrt2]
// 2026-06-27, Composer: canonical pair indices without dropping contacts [ctrt4]
