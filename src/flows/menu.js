/** @namespace ty */
// 2026-06-17, Composer: root menu flow lazy dev menu swap [flwmn1]
import FlowBase from "../core/flowbase.js";
import DevMenuFlow from "./dev_menu.js";

/**
 * @class MenuFlow
 * @memberof pb.flows
 */
class MenuFlow extends FlowBase {
	/**
	 * @returns {this}
	 */
	init() {
		/** @type {DevMenuFlow|null} */
		this._devMenu = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-17, Composer: root menu flow lazy dev menu swap [flwmn1]
		this._core.ui.setstate("ui_root_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "root_btn_0") {
				this._open_dev_menu();
			}
		});
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		this._core.ui.delstate("ui_root_vis");
	}

	/** @returns {void} */
	teardown() {
		if (this._devMenu) {
			this._devMenu.teardown_active();
		}
		this._core.flowbus.detach(this);
	}

	/** @returns {void} */
	_open_dev_menu() {
		if (!this._devMenu) {
			this._devMenu = new DevMenuFlow(this._core, this).init();
		}
		this._swap(this._devMenu);
	}

	/**
	 * @param {FlowBase} next
	 * @returns {void}
	 */
	_swap(next) {
		this._core.flowbus.detach(this);
		this._core.flowbus.attach(next);
	}
}

export default MenuFlow;
// 2026-06-17, Composer: root menu flow lazy dev menu swap [flwmn1]
