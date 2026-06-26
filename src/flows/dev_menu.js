/** @namespace ty */
// 2026-06-17, Composer: dev menu flow lazy test swap [flwdmn1]
// 2026-06-18, Composer: dev menu back button to root [flwdmn2]
// 2026-06-26, Composer: dev menu settings button swap [flwdmn3]
// 2026-06-26, Composer: dev menu navigate events no parent ctor [flwdmn4]
import FlowBase from "../core/flowbase.js";

/**
 * @class DevMenuFlow
 * @memberof pb.flows
 */
class DevMenuFlow extends FlowBase {
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
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-26, Composer: dev menu navigate events no parent ctor [flwdmn4]
		this._core.ui.setstate("ui_dev_menu_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "dev_btn_0") {
				this._core.eventsbus.emit("flow.navigate", { to: "root" });
				return;
			}
			if (event === "dev_btn_1") {
				this._core.eventsbus.emit("flow.navigate", { to: "test" });
				return;
			}
			if (event === "dev_btn_2") {
				this._core.eventsbus.emit("flow.navigate", { to: "settings" });
			}
		});
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		this._core.ui.delstate("ui_dev_menu_vis");
	}
}

export default DevMenuFlow;
// 2026-06-26, Composer: dev menu navigate events no parent ctor [flwdmn4]
// 2026-06-26, Composer: dev menu settings button swap [flwdmn3]
