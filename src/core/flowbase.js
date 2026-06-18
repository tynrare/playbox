/** @namespace ty */
// 2026-06-17, Composer: flow base lifecycle stubs [flwbs1]
// 2026-06-17, Composer: flow dispose calls stop for teardown [flwdsp1]

/**
 * @class FlowBase
 * @memberof pb.core
 */
class FlowBase {
	/**
	 * @brief Base flow; subclasses override lifecycle hooks.
	 * @param {import("./core.js").default} core
	 */
	constructor(core) {
		this._core = core;
	}

	/**
	 * @brief Alloc and refs only; chainable via return this.
	 * @returns {this}
	 */
	init() {
		return this;
	}

	/** @returns {void} */
	start() {}

	/**
	 * @param {number} dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(_dt, _rdt) {}

	/** @returns {void} */
	stop() {}

	/** @returns {void} */
	dispose() {
		// 2026-06-17, Composer: flow dispose calls stop for teardown [flwdsp1]
		this.stop();
	}
}

export default FlowBase;
// 2026-06-17, Composer: flow base lifecycle stubs [flwbs1]
// 2026-06-17, Composer: flow dispose calls stop for teardown [flwdsp1]
