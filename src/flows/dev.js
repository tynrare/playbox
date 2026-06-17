/** @namespace ty */
// 2026-06-17, Composer: dev flow settings ui debug click [flwdev1]
// 2026-06-17, Composer: dev flow stop clears ui states [flwdev2]
import FlowBase from "../core/flowbase.js";
import Settings from "../play/settings.js";

/**
 * @class DevFlow
 * @memberof pb.flows
 */
class DevFlow extends FlowBase {
	/**
	 * @returns {this}
	 */
	init() {
		this.settings = new Settings(this._core.datawork);
		return this;
	}

	/** @returns {void} */
	start() {
		this._core.ui.setstate("ui_dev");
		this._core.ui.setstate("ui_tests_vis");
		this.settings.start(this._core);
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event !== "debug_button") {
				return;
			}
			this.settings.dev_debug_state = !this.settings.dev_debug_state;
			this.settings.apply(this._core);
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
		this._core.ui.delstate("ui_tests_vis");
	}
}

export default DevFlow;
// 2026-06-17, Composer: dev flow settings ui debug click [flwdev1]
// 2026-06-17, Composer: dev flow stop clears ui states [flwdev2]
