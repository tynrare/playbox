/** @namespace ty */
// 2026-06-26, Composer: arcade flow close btn returns root [flwarc1]
import FlowBase from "../core/flowbase.js";
import Arcade from "../play/arcade.js";

/**
 * @class ArcadeFlow
 * @memberof pb.flows
 */
class ArcadeFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		super(core);
	}

	/**
	 * @returns {this}
	 */
	init() {
		this._play = new Arcade(this._core).init();
		/** @type {number|null} */
		this._ui_click_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		this._play.start();
		this._core.ui.setstate("ui_arcade_vis");
		// 2026-06-26, Composer: arcade flow close btn returns root [flwarc1]
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "arcade_close") {
				this._core.eventsbus.emit("flow.navigate", { to: "root" });
			}
		});
	}

	/**
	 * @param {number} dt
	 * @param {number} rdt
	 * @returns {void}
	 */
	step(dt, rdt) {
		this._play.step(dt, rdt);
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		this._core.ui.delstate("ui_arcade_vis");
		this._play.stop();
	}

	/** @returns {void} */
	dispose() {
		this._play.dispose();
	}
}

export default ArcadeFlow;
// 2026-06-26, Composer: arcade flow close btn returns root [flwarc1]
