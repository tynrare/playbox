/** @namespace ty */
// 2026-06-17, Composer: dev flow settings ui debug click [flwdev1]
// 2026-06-17, Composer: dev flow stop clears ui states [flwdev2]
// 2026-06-18, Composer: dev flow receives shared settings [flwdev3]
import FlowBase from "../core/flowbase.js";

/**
 * @class DevFlow
 * @memberof pb.flows
 */
class DevFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {import("../play/settings.js").default} settings
	 */
	constructor(core, settings) {
		super(core);
		this._settings = settings;
	}

	/**
	 * @returns {this}
	 */
	init() {
		return this;
	}

	/** @returns {void} */
	start() {
		this._core.ui.setstate("ui_dev");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event !== "debug_button") {
				return;
			}
			// 2026-06-18, Composer: dev flow receives shared settings [flwdev3]
			this._settings.dev_debug_state = !this._settings.dev_debug_state;
			this._settings.apply(this._core);
		});
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		// 2026-06-17, Composer: dev flow stop clears ui states [flwdev2]
		this._core.ui.delstate("ui_dev");
	}
}

export default DevFlow;
// 2026-06-17, Composer: dev flow settings ui debug click [flwdev1]
// 2026-06-17, Composer: dev flow stop clears ui states [flwdev2]
// 2026-06-18, Composer: dev flow receives shared settings [flwdev3]
