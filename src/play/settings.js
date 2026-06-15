/** @namespace ty */
// 2026-06-14, Composer: dev_debug_state settings with ui setstate [stgs1]
// 2026-06-14, Composer: rename ui_dev_states to ui_debug_enabled [stgs2]
import Datawork from "../core/datawork.js";

const UI_DEBUG_ENABLED = "ui_debug_enabled";

/**
 * @class Settings
 * @memberof pb.play
 */
class Settings {
	/**
	 * @param {Datawork} datawork
	 */
	constructor(datawork) {
		this._datawork = datawork;
	}

	/**
	 * @returns {boolean}
	 */
	get dev_debug_state() {
		return this._datawork.load("dev_debug_state") == 2;
	}

	/**
	 * @param {boolean} v
	 */
	set dev_debug_state(v) {
		this._datawork.save("dev_debug_state", v ? 2 : 1);
	}

	/**
	 * @param {import("../core/core.js").default} core
	 * @returns {void}
	 */
	start(core) {
		this.apply(core);
	}

	/**
	 * @param {import("../core/core.js").default} core
	 * @returns {void}
	 */
	apply(core) {
		const on = this.dev_debug_state;
		core.physics.config.debug = on;
		core.physics.sync_debug_draw(on);
		if (on) {
			core.ui.setstate(UI_DEBUG_ENABLED);
		} else {
			core.ui.delstate(UI_DEBUG_ENABLED);
		}
	}
}

export default Settings;
// 2026-06-14, Composer: dev_debug_state settings with ui setstate [stgs1]
// 2026-06-14, Composer: rename ui_dev_states to ui_debug_enabled [stgs2]
