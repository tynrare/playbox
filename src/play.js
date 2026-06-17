/** @namespace ty */
// 2026-06-14, Composer: import core from src/core [g7c9e3]
// 2026-06-17, Composer: play boot attaches menu flow only [plmn1]
// 2026-06-17, Composer: play keeps dev flow always attached [pldev1]
import Core from "./core/core.js";
import DevFlow from "./flows/dev.js";
import MenuFlow from "./flows/menu.js";

/**
 * @class Play
 * @memberof pb.play
 */
class Play {
	/**
	 * @param {Core} core
	 */
	constructor(core) {
		this._core = core;
		/** @type {DevFlow|null} */
		this._dev = null;
		/** @type {MenuFlow|null} */
		this._menu = null;
	}

	/**
	 * @returns {Play}
	 */
	init() {
		// 2026-06-17, Composer: play keeps dev flow always attached [pldev1]
		this._dev = new DevFlow(this._core).init();
		this._menu = new MenuFlow(this._core).init();
		return this;
	}

	/**
	 * @param {boolean} visible
	 * @returns {void}
	 */
	splashscreen(visible) {
		if (visible) {
			this._core.ui.setstate("ui_loading");
		} else {
			this._core.ui.delstate("ui_loading");
		}
	}

	/** @returns {void} */
	start() {
		this.splashscreen(false);
		if (this._dev) {
			this._core.flowbus.attach(this._dev);
		}
		if (this._menu) {
			this._core.flowbus.attach(this._menu);
		}
	}

	/** @returns {void} */
	stop() {
		this._menu?.teardown();
		if (this._dev) {
			this._core.flowbus.detach(this._dev);
		}
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}
}

export default Play;
// 2026-06-14, Composer: import core from src/core [g7c9e3]
// 2026-06-17, Composer: play boot attaches menu flow only [plmn1]
// 2026-06-17, Composer: play keeps dev flow always attached [pldev1]
