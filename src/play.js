/** @namespace ty */
// 2026-06-14, Composer: import core from src/core [g7c9e3]
// 2026-06-17, Composer: play boot attaches menu flow only [plmn1]
// 2026-06-18, Composer: play owns settings inject flows [plstg1]
// 2026-06-26, Composer: play attaches menu flow only no dev [plmn2]
import Core from "./core/core.js";
import MenuFlow from "./flows/menu.js";
import Settings from "./play/settings.js";

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
		/** @type {MenuFlow|null} */
		this._menu = null;
		/** @type {Settings|null} */
		this._settings = null;
	}

	/**
	 * @returns {Play}
	 */
	init() {
		// 2026-06-18, Composer: play owns settings inject flows [plstg1]
		// 2026-06-26, Composer: play attaches menu flow only no dev [plmn2]
		this._settings = new Settings(this._core.datawork);
		this._menu = new MenuFlow(this._core, this._settings).init();
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
		this._settings?.start(this._core);
		if (this._menu) {
			this._core.flowbus.attach(this._menu);
			// 2026-06-26, Composer: play boot navigates readysplash not arcade [plrsp1]
			this._menu.navigate("readysplash");
		}
	}

	/** @returns {void} */
	stop() {
		this._menu?.teardown();
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}
}

export default Play;
// 2026-06-26, Composer: play attaches menu flow only no dev [plmn2]
// 2026-06-18, Composer: play owns settings inject flows [plstg1]
// 2026-06-26, Composer: play boot navigates readysplash not arcade [plrsp1]
