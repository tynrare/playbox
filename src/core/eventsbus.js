/** @namespace ty */
// 2026-06-14, Composer: hub bridge inputs to namespaced channels [evbs1]
import Events from "./events.js";

/** @type {Record<string, string>} */
export const INPUTS_BRIDGE_MAP = {
	pointerdown: "pointer.down",
	pointerup: "pointer.up",
	pointerclick: "pointer.click",
	pointermove: "pointer.move",
	pointerpressedmove: "pointer.pressedmove",
	pointerdrag: "pointer.drag",
};

/**
 * @class EventsBus
 * @memberof pb.core
 */
class EventsBus {
	constructor() {
		/** @type {Events} */
		this._events = new Events();
		/** @type {Array<{ sourceEvents: Events, id: number }>} */
		this._bridges = [];
	}

	/**
	 * @param {string} channel
	 * @param {function(any): void} callback
	 * @returns {number}
	 */
	on(channel, callback) {
		return this._events.on(channel, callback);
	}

	/**
	 * @param {number} id
	 * @returns {void}
	 */
	off(id) {
		this._events.off(id);
	}

	/**
	 * @param {string} channel
	 * @param {any} [detail]
	 * @returns {void}
	 */
	emit(channel, detail) {
		this._events.emit(channel, detail);
	}

	/**
	 * @param {string} sourceName
	 * @param {Events} sourceEvents
	 * @param {Record<string, string>} map
	 * @returns {void}
	 */
	register(sourceName, sourceEvents, map) {
		for (const from in map) {
			const to = map[from];
			const id = sourceEvents.on(from, (detail) => {
				this.emit(to, { ...detail, source: sourceName });
			});
			this._bridges.push({ sourceEvents, id });
		}
	}

	/**
	 * @returns {void}
	 */
	dispose() {
		for (const bridge of this._bridges) {
			bridge.sourceEvents.off(bridge.id);
		}
		this._bridges.length = 0;
		this._events.dispose();
	}
}

export default EventsBus;
// 2026-06-14, Composer: hub bridge inputs to namespaced channels [evbs1]
