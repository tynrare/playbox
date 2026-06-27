// Nav gateway: permanent router; lazy panes; flow.navigate in, flowbus swap out.

// Scope in: root/dev/settings/test routing, dev debug overlay, flow.state emits.

// Scope out: pane business logic (dev_menu, settings_menu, test).

// Gateway role: pattern | Scope id: nav-scope | Flow id: flw-mnu

//

// flw-mnu flow:

// 1) init → register flow.navigate + debug listeners; lazy pane map

// 2) start (root pane) → ui_root_vis; emit open root on first boot

// 3) flow.navigate → _route(to): close active, detach, attach target, open

// 4) stop (root pane) → clear root UI only; ui_dev stays until teardown

// 5) teardown → close active, detach, dispose panes, off listeners

// Branches: _active tracks current pane key; root pane is MenuFlow itself

/** @namespace ty */
// 2026-06-17, Composer: root menu flow lazy dev menu swap [flwmn1]
// 2026-06-26, Composer: menu router event nav no parent ctors [flwmn5]
// 2026-06-26, Composer: flow.navigate flow.state generic nav names [flwmn6]
import FlowBase from "../core/flowbase.js";
import ArcadeFlow from "./arcade.js";
import DevMenuFlow from "./dev_menu.js";
import ReadySplashFlow from "./readysplash.js";
import SettingsMenuFlow from "./settings_menu.js";
import TestFlow from "./test.js";

/** @typedef {"root"|"dev"|"settings"|"test"|"arcade"|"readysplash"} FlowKey */

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
		/** @type {FlowKey} */
		this._active = "root";
		/** @type {Record<string, FlowBase|null>} */
		this._flows = {
			dev: null,
			settings: null,
			test: null,
			arcade: null,
			readysplash: null,
		};
		this._boot_opened = false;
		/** @type {number|null} */
		this._nav_id = null;
		/** @type {number|null} */
		this._ui_click_id = null;
		/** @type {number|null} */
		this._debug_click_id = null;
		// 2026-06-26, Composer: flow.navigate flow.state generic nav names [flwmn6]
		this._nav_id = this._core.eventsbus.on("flow.navigate", ({ to }) => {
			if (to) {
				this._route(/** @type {FlowKey} */ (to));
			}
		});
		this._debug_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event !== "debug_button") {
				return;
			}
			this._settings.dev_debug_state = !this._settings.dev_debug_state;
			this._settings.apply(this._core);
		});
		this._core.ui.setstate("ui_dev");
		return this;
	}

	/** @returns {void} */
	start() {
		this._core.ui.setstate("ui_root_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "root_btn_0") {
				this._core.eventsbus.emit("flow.navigate", { to: "dev" });
				return;
			}
			// 2026-06-26, Composer: root menu arcade button nav [flwmn7]
			if (event === "root_btn_1") {
				this._core.eventsbus.emit("flow.navigate", { to: "arcade" });
			}
		});
		if (!this._boot_opened) {
			this._core.flowbus.emitFlowState("open", "root");
			this._boot_opened = true;
		}
	}

	/**
	 * @param {FlowKey} to
	 * @returns {void}
	 */
	navigate(to) {
		this._core.eventsbus.emit("flow.navigate", { to });
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
		const flowbus = this._core.flowbus;
		flowbus.emitFlowState("close", this._active);
		flowbus.detach(this._getFlow(this._active));
		if (this._nav_id != null) {
			this._core.eventsbus.off(this._nav_id);
			this._nav_id = null;
		}
		if (this._debug_click_id != null) {
			this._core.eventsbus.off(this._debug_click_id);
			this._debug_click_id = null;
		}
		this._core.ui.delstate("ui_dev");
		const keys = ["dev", "settings", "test", "arcade", "readysplash"];
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			this._flows[key]?.dispose();
			this._flows[key] = null;
		}
	}

	/**
	 * @param {FlowKey} to
	 * @returns {void}
	 */
	_route(to) {
		if (to === this._active) {
			return;
		}
		const flowbus = this._core.flowbus;
		flowbus.emitFlowState("close", this._active);
		flowbus.detach(this._getFlow(this._active));
		const target = this._getFlow(to);
		flowbus.attach(target);
		this._active = to;
		flowbus.emitFlowState("open", to);
	}

	/**
	 * @param {FlowKey} key
	 * @returns {FlowBase}
	 */
	_getFlow(key) {
		if (key === "root") {
			return this;
		}
		if (!this._flows[key]) {
			if (key === "dev") {
				this._flows.dev = new DevMenuFlow(this._core).init();
			} else if (key === "settings") {
				this._flows.settings = new SettingsMenuFlow(this._core, this._settings).init();
			} else if (key === "test") {
				this._flows.test = new TestFlow(this._core).init();
			} else if (key === "arcade") {
				this._flows.arcade = new ArcadeFlow(this._core).init();
			} else if (key === "readysplash") {
				// 2026-06-26, Composer: readysplash lazy pane factory [flwrsp2]
				this._flows.readysplash = new ReadySplashFlow(this._core).init();
			}
		}
		return /** @type {FlowBase} */ (this._flows[key]);
	}
}

export default MenuFlow;
// 2026-06-26, Composer: root menu arcade button nav [flwmn7]
// 2026-06-26, Composer: flow.navigate flow.state generic nav names [flwmn6]
// 2026-06-26, Composer: menu router event nav no parent ctors [flwmn5]
// 2026-06-26, Composer: readysplash lazy pane factory [flwrsp2]
