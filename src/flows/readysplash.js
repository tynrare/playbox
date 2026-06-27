/** @namespace ty */
// 2026-06-26, Composer: readysplash start btn nav to arcade [flwrsp1]
import { cache } from "../math.js";
import FlowBase from "../core/flowbase.js";

const COIN_Y = 0.5;

/**
 * @class ReadySplashFlow
 * @memberof pb.flows
 */
class ReadySplashFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		super(core);
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {number|null} */
		this._ui_click_id = null;
		/** @type {number|null} */
		this._floor_index = null;
		/** @type {number|null} */
		this._coin_toy = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-26, Composer: readysplash immediate spawn set position [flwrsp4]
		this._core.scene.environment.floorstyle("floor", 0xffffff);
		this._core.scene.environment.shadowstyle(0x0, 0.5);

		this._core.render.camera.position.set(0, 10, 2);
		this._core.render.camera.lookAt(0, 0, 0);

		this._floor_index = this._core.itembox.spawn("floor_item", true);
		if (this._floor_index != null) {
			this._core.scene.set_itemposition(
				this._floor_index,
				cache.vec3.v0.set(0, -0.05, 0),
			);
		}

		const toy_index = this._core.toybox.spawn("coin_a_toy", true);
		if (toy_index != null) {
			this._coin_toy = toy_index;
			const item_index = this._core.toybox.get_item_index(toy_index);
			this._core.scene.set_itemposition(item_index, 4, COIN_Y, -2);
		}

		this._core.ui.setstate("ui_readysplash_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "readysplash_start") {
				this._core.eventsbus.emit("flow.navigate", { to: "arcade" });
			}
		});
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		this._core.ui.delstate("ui_readysplash_vis");

		if (this._coin_toy != null) {
			this._core.toybox.despawn(this._coin_toy, true);
			this._coin_toy = null;
		}
		if (this._floor_index != null) {
			this._core.itembox.despawn(this._floor_index, true);
			this._floor_index = null;
		}

		this._core.scene.environment.floorstyle(null, 0xffffff);
	}
}

export default ReadySplashFlow;
// 2026-06-26, Composer: readysplash start btn nav to arcade [flwrsp1]
// 2026-06-26, Composer: readysplash immediate spawn set position [flwrsp4]
