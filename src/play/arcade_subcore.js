/** @namespace ty */
// Purpose: runtime wrapper for arcade emulators rendered into texture targets.

import Core from "../core/core.js";
import RenderTargetRender from "../core/render_target.js";

/**
 * @class ArcadeSubcore
 * @memberof pb.play
 */
class ArcadeSubcore {
	/**
	 * @param {import("../core/core.js").default} parentCore
	 * @param {number} width
	 * @param {number} height
	 */
	constructor(parentCore, width, height) {
		this._parent_core = parentCore;
		this.width = width;
		this.height = height;
	}

	/** @returns {this} */
	init() {
		/** @type {Core|null} */
		this.core = null;
		/** @type {RenderTargetRender|null} */
		this.render = null;
		return this;
	}

	/** @returns {void} */
	start() {
		if (this.core) {
			return;
		}
		const renderer = this._parent_core.render.renderer;
		if (!renderer) {
			return;
		}
		// 2026-07-01, GPT-5.5: emulator owns injected subcore runtime [subcor1]
		this.render = new RenderTargetRender(renderer, this.width, this.height).init();
		this.core = new Core({
			render: this.render,
			db: this._parent_core.db,
			assets: this._parent_core.assets,
			bindInputs: false,
		}).init();
		this.core.arcadeScreenDepth = (this._parent_core.arcadeScreenDepth ?? 0) + 1;
		this.core.start();
	}

	/**
	 * @param {number} dt
	 * @param {number} rdt
	 * @returns {void}
	 */
	step(dt, rdt) {
		this.core?.step(dt, rdt);
	}

	/** @returns {import("three").Texture|null} */
	get texture() {
		return this.render?.target?.texture ?? null;
	}

	/** @returns {void} */
	stop() {
		this.core?.dispose();
		this.core = null;
		this.render = null;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}
}

export default ArcadeSubcore;
// 2026-07-01, GPT-5.5: emulator owns injected subcore runtime [subcor1]
