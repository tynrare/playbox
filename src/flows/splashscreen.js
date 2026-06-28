/** @namespace ty */
// 2026-06-28, Composer: boot splash ui_loading flow [flwspl1]
// 2026-06-28, Composer: splash step spin loading hourglass [flwspl2]
import FlowBase from "../core/flowbase.js";
import { v3forward } from "../math.js";

const SPIN_SPEED = 0.6;

/**
 * @class SplashFlow
 * @memberof pb.flows
 */
class SplashFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		super(core);
		/** @type {number} */
		this._spin = 0;
	}

	/** @returns {void} */
	start() {
		this._spin = 0;
		this._core.ui.setstate("ui_loading");
	}

	/**
	 * @param {number} dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(dt, _rdt) {
		const element = this._core.ui.elements.loading_icon;
		if (!element || element.kind !== "sprite") {
			return;
		}
		this._spin += dt * SPIN_SPEED;
		element.mesh.quaternion.setFromAxisAngle(v3forward, this._spin);
		element.mesh.updateMatrix();
	}

	/** @returns {void} */
	stop() {
		const element = this._core.ui.elements.loading_icon;
		if (element?.kind === "sprite") {
			element.mesh.quaternion.setFromAxisAngle(v3forward, 0);
			element.mesh.updateMatrix();
		}
		this._core.ui.delstate("ui_loading");
	}
}

export default SplashFlow;
// 2026-06-28, Composer: boot splash ui_loading flow [flwspl1]
// 2026-06-28, Composer: splash step spin loading hourglass [flwspl2]
