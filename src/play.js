/** @namespace ty */
// 2026-06-14, Composer: import core from src/core [g7c9e3]
// 2026-06-17, Composer: play attaches flows splashscreen only [plflw1]
import Core from "./core/core.js";
import DevFlow from "./flows/dev.js";
import TestFlow from "./flows/test.js";

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
		/** @type {import("./core/flowbase.js").default[]} */
		this._flows = [];
	}

	/**
	 * @returns {Play}
	 */
	init() {
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
		const dev = new DevFlow(this._core).init();
		const test = new TestFlow(this._core).init();
		this._flows.push(dev, test);
		this._core.flowbus.attach(dev);
		this._core.flowbus.attach(test);
	}

	/** @returns {void} */
	stop() {
		// 2026-06-17, Composer: play stop detaches tracked flows [plstop1]
		for (let i = 0; i < this._flows.length; i++) {
			this._core.flowbus.detach(this._flows[i]);
		}
		this._flows.length = 0;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}
}

export default Play;
// 2026-06-14, Composer: import core from src/core [g7c9e3]
// 2026-06-17, Composer: play attaches flows splashscreen only [plflw1]
// 2026-06-17, Composer: play stop detaches tracked flows [plstop1]
