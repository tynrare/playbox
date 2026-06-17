/** @namespace ty */
// 2026-06-17, Composer: dev menu flow lazy test swap [flwdmn1]
import FlowBase from "../core/flowbase.js";
import TestFlow from "./test.js";

/**
 * @class DevMenuFlow
 * @memberof pb.flows
 */
class DevMenuFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {import("./menu.js").default} menuFlow
	 */
	constructor(core, menuFlow) {
		super(core);
		this._menu = menuFlow;
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {TestFlow|null} */
		this._test = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-17, Composer: dev menu flow lazy test swap [flwdmn1]
		this._core.ui.setstate("ui_dev_menu_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "dev_btn_0") {
				this._open_test();
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

	/** @returns {void} */
	_open_test() {
		if (!this._test) {
			this._test = new TestFlow(this._core, this._menu).init();
		}
		this._swap(this._test);
	}

	/** @returns {void} */
	teardown_active() {
		if (this._test) {
			this._core.flowbus.detach(this._test);
		}
		this._core.flowbus.detach(this);
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

export default DevMenuFlow;
// 2026-06-17, Composer: dev menu flow lazy test swap [flwdmn1]
