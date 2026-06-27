// Flow-scope gateway: flow carrier; core drives start/stop/step/dispose.

// Scope in: attach/detach flows, passthrough tick/teardown.

// Scope out: flow business logic (flows/*), subsystem wiring.

// Gateway role: pattern | Scope id: flow-scope | Flow id: flw-bus

//

// flw-bus flow:

// 1) attach(flow) → push; flow.start() if bus running (flow already init'd by caller)

// 2) detach(flow) → flow.stop(); remove from bus

// 3) core.start → flowbus.start sets running; starts attached flows

// 4) core.step → iterate attached flows step

// 5) core.stop → bus stops; flows stay attached

// 6) core.dispose → stop, dispose all, clear list

// Branches: late attach after bus.start auto-starts flow

// Touchpoints: flow.state open/close via emitFlowState (flw-mnu router)

/** @namespace ty */

// 2026-06-17, Composer: flowbus attach detach running flag [flwatt1]
// 2026-06-17, Composer: flowbus start idempotent guard [flwidp1]
// 2026-06-26, Composer: flowbus emitFlowState flow.state [flwflw1]

import FlowBase from "./flowbase.js";



/**

 * @class FlowBus

 * @memberof pb.core

 */

class FlowBus {

	/**

	 * @brief Flow carrier; eventsbus held for future bus-level wiring.

	 * @param {import("./eventsbus.js").default} eventsbus

	 */

	constructor(eventsbus) {

		this._eventsbus = eventsbus;

		/** @type {FlowBase[]} */

		this._flows = [];

		this._running = false;

	}



	/**

	 * @brief Accept flow on bus; caller must have called flow.init() first.

	 * @param {FlowBase} flow

	 * @returns {void}

	 */

	attach(flow) {

		this._flows.push(flow);

		if (this._running) {

			flow.start();

		}

	}



	/**

	 * @brief Stop flow and remove from bus.

	 * @param {FlowBase} flow

	 * @returns {void}

	 */

	detach(flow) {

		const i = this._flows.indexOf(flow);

		if (i < 0) {

			return;

		}

		flow.stop();

		this._flows.splice(i, 1);

	}

	/**
	 * @brief Emit attached-flow open/close for router subscribers.
	 * @param {"open"|"close"} action
	 * @param {"root"|"dev"|"settings"|"test"|"arcade"|"readysplash"} key
	 * @returns {void}
	 */
	emitFlowState(action, key) {
		// 2026-06-26, Composer: flowbus readysplash flow.state key [flwflw3]
		this._eventsbus.emit("flow.state", { action, key });
	}

	/** @returns {void} */

	start() {
		if (this._running) {
			return;
		}
		// 2026-06-17, Composer: flowbus start idempotent guard [flwidp1]
		this._running = true;

		for (let i = 0; i < this._flows.length; i++) {

			this._flows[i].start();

		}

	}



	/**
	 * @param {number} dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(dt, _rdt) {
		for (let i = 0; i < this._flows.length; i++) {
			this._flows[i].step(dt, _rdt);
		}
	}



	/** @returns {void} */

	stop() {

		this._running = false;

		for (let i = 0; i < this._flows.length; i++) {

			this._flows[i].stop();

		}

	}



	/** @returns {void} */

	dispose() {

		this.stop();

		for (let i = 0; i < this._flows.length; i++) {

			this._flows[i].dispose();

		}

		this._flows.length = 0;

	}

}



export default FlowBus;
// 2026-06-26, Composer: flowbus arcade flow.state key [flwflw2]
// 2026-06-26, Composer: flowbus readysplash flow.state key [flwflw3]
// 2026-06-26, Composer: flowbus emitFlowState flow.state [flwflw1]
// 2026-06-17, Composer: flowbus attach detach running flag [flwatt1]
// 2026-06-17, Composer: flowbus start idempotent guard [flwidp1]


