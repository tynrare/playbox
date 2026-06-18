/** @namespace ty */
// 2026-06-17, Composer: root menu flow lazy dev menu swap [flwmn1]
// 2026-06-18, Composer: root menu settings button swap [flwmn2]
// 2026-06-18, Composer: menu flow receives shared settings [flwmn3]
import FlowBase from "../core/flowbase.js";
import DevMenuFlow from "./dev_menu.js";
import SettingsMenuFlow from "./settings_menu.js";

/**
 * @class MenuFlow
 * @memberof pb.flows
 */
class MenuFlow extends FlowBase {
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
		/** @type {DevMenuFlow|null} */
		this._devMenu = null;
		/** @type {SettingsMenuFlow|null} */
		this._settingsMenu = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-17, Composer: root menu flow lazy dev menu swap [flwmn1]
		// 2026-06-18, Composer: root menu settings button swap [flwmn2]
		this._core.ui.setstate("ui_root_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "root_btn_0") {
				this._open_dev_menu();
				return;
			}
			// 2026-06-18, Composer: root menu settings button swap [flwmn2]
			if (event === "root_btn_1") {
				this._open_settings_menu();
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
		if (this._settingsMenu) {
			this._settingsMenu.teardown_active();
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

	/** @returns {void} */
	_open_settings_menu() {
		if (!this._settingsMenu) {
			// 2026-06-18, Composer: menu flow receives shared settings [flwmn3]
			this._settingsMenu = new SettingsMenuFlow(this._core, this, this._settings).init();
		}
		this._swap(this._settingsMenu);
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
// 2026-06-18, Composer: root menu settings button swap [flwmn2]
// 2026-06-18, Composer: menu flow receives shared settings [flwmn3]
