/** @namespace ty */
// 2026-06-17, Composer: test flow spawn orbit decor despawn [flwtst1]
// 2026-06-17, Composer: test flow stop despawns decor resets camera [flwtst2]
// 2026-06-17, Composer: test flow close btn returns menu [flwtst3]
// 2026-06-17, Composer: test ok button despawns toy [flwtst4]
import FlowBase from "../core/flowbase.js";

/**
 * @class TestFlow
 * @memberof pb.flows
 */
class TestFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {import("./menu.js").default} menuFlow
	 */
	constructor(core, menuFlow) {
		super(core);
		this._menu = menuFlow;
	}

	/**
	 * @returns {this}
	 */
	init() {
		this._orbit_time = 0;
		this._orbit_radius = 2.75;
		this._orbit_height = 1.35;
		this._orbit_speed = 0.8;
		/** @type {number|null} */
		this._floor_index = null;
		/** @type {number|null} */
		this._toy_index = null;
		this._toy_positions_applied = false;
		/** @type {import("three").Vector3|null} */
		this._camera_home = null;
		return this;
	}

	/** @returns {void} */
	start() {
		const camera = this._core.render?.camera;
		if (camera) {
			this._camera_home = camera.position.clone();
		}

		this._core.scene.environment.floorstyle("floor", 0xffffff);
		this._floor_index = this._core.itembox.spawn("floor_item");
		this._toy_index = this._core.toybox.spawn("box_test_toy");
		this._toy_positions_applied = false;

		this.label3d = this._core.scene.text("afont", false);
		if (this.label3d) {
			this.label3d.text = "on box";
			this.label3d.fontsize = 0.12;
			this.label3d.anchor.set(0.5, 0.5);
			this.label3d.update();
		}

		this.ping = this._core.scene.makesprite("pingtag", false);
		if (this.ping) {
			this.ping.updateMatrix();
		}

		this._sync_toy_decor();

		// 2026-06-17, Composer: test flow close btn returns menu [flwtst3]
		// 2026-06-17, Composer: test ok button despawns toy [flwtst4]
		// 2026-06-17, Composer: test flow ui_test and ui_tests vis [flwtst5]
		this._core.ui.setstate("ui_test_vis");
		this._core.ui.setstate("ui_tests_vis");
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "debug_button") {
				return;
			}
			if (event === "test_close") {
				this._return_menu();
				return;
			}
			// 2026-06-17, Composer: test ok button despawns toy [flwtst4]
			if (event === "button_test") {
				this._core.toybox.despawn(this._toy_index);
			}
		});
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	step(dt) {
		this._apply_toy_positions();
		this._update_camera_orbit(dt);
		this._sync_toy_decor();
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		this._core.ui.delstate("ui_test_vis");
		this._core.ui.delstate("ui_tests_vis");
		this._core.ui.delstate("ui_tests_states");
		// 2026-06-17, Composer: test flow stop despawns decor resets camera [flwtst2]
		this.label3d?.remove();
		this.label3d = null;
		this.ping?.remove();
		this.ping = null;
		if (this._toy_index != null) {
			this._core.toybox.despawn(this._toy_index, true);
			this._toy_index = null;
		}
		if (this._floor_index != null) {
			this._core.itembox.despawn(this._floor_index, true);
			this._floor_index = null;
		}
		// 2026-06-17, Composer: test stop hides environment floor plane [flwtst6]
		this._core.scene.environment.floorstyle(null, 0xffffff);
		const camera = this._core.render?.camera;
		if (camera && this._camera_home) {
			camera.position.copy(this._camera_home);
			camera.lookAt(0, 0, 0);
		}
	}

	/** @returns {void} */
	_return_menu() {
		this._core.flowbus.detach(this);
		this._core.flowbus.attach(this._menu);
	}

	/** @returns {void} */
	_apply_toy_positions() {
		if (this._toy_positions_applied || this._toy_index == null) {
			return;
		}
		const item_index = this._core.toybox.get_item_index(this._toy_index);
		const entity = this._core.scene.get_itementity(item_index);
		if (!entity) {
			return;
		}
		if (this._floor_index != null) {
			this._core.scene.set_itemposition(this._floor_index, 0, -0.05, 0);
		}
		this._core.scene.set_itemposition(item_index, 0, 2, -1.25);
		this._toy_positions_applied = true;
	}

	/** @returns {void} */
	_sync_toy_decor() {
		const item_index = this._core.toybox.get_item_index(this._toy_index);
		const entity = this._core.scene.get_itementity(item_index);
		if (!entity) {
			return;
		}

		const { x, y, z } = entity.position;
		if (this.label3d) {
			this.label3d.position.set(x, y + 0.65, z);
			this.label3d.update();
		}
		if (this.ping) {
			this.ping.position.set(x, y + 1.1, z);
			this.ping.updateMatrix();
		}
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	_update_camera_orbit(dt) {
		const camera = this._core?.render?.camera;
		if (!camera) {
			return;
		}

		this._orbit_time += dt * this._orbit_speed;
		const x = Math.cos(this._orbit_time) * this._orbit_radius;
		const z = Math.sin(this._orbit_time) * this._orbit_radius;
		camera.position.set(x, this._orbit_height, z);
		camera.lookAt(0, 0, 0);
	}
}

export default TestFlow;
// 2026-06-17, Composer: test flow spawn orbit decor despawn [flwtst1]
// 2026-06-17, Composer: test flow stop despawns decor resets camera [flwtst2]
// 2026-06-17, Composer: test flow close btn returns menu [flwtst3]
// 2026-06-17, Composer: test ok button despawns toy [flwtst4]
// 2026-06-17, Composer: test flow ui_test and ui_tests vis [flwtst5]
// 2026-06-17, Composer: test stop hides environment floor plane [flwtst6]
