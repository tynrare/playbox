/** @namespace ty */
// 2026-06-18, Composer: settings menu flow back to dev menu [flwstg7]
// 2026-06-18, Composer: settings menu floor toy stack [flwstg2]
// 2026-06-18, Composer: settings menu distant orbit camera [flwstg3]
// 2026-06-18, Composer: settings menu quality cycle button [flwstg4]
// 2026-06-18, Composer: settings shadows tilt shift ao toggles [flwstg5]
// 2026-06-18, Composer: settings pixelate postprocess toggle [flwstg6]
// 2026-06-26, Composer: settings menu navigate events no parent [flwstg8]
import FlowBase from "../core/flowbase.js";

const TOY_STACK_COUNT = 10;
const TOY_STACK_KEY = "box_just_toy";
const ORBIT_RADIUS = 4;
const ORBIT_HEIGHT = 8;
const ORBIT_SPEED = 0.2;
const ORBIT_LOOK_Y = 5;

/**
 * @class SettingsMenuFlow
 * @memberof pb.flows
 */
class SettingsMenuFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {import("../play/settings.js").default} settings
	 */
	constructor(core, settings) {
		super(core);
		this._settings = settings;
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {number|null} */
		this._floor_index = null;
		/** @type {number[]} */
		this._toy_indices = [];
		this._positions_applied = false;
		this._orbit_time = 0;
		/** @type {import("three").Vector3|null} */
		this._camera_home = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-18, Composer: settings menu flow back to dev menu [flwstg7]
		// 2026-06-18, Composer: settings menu floor toy stack [flwstg2]
		// 2026-06-18, Composer: settings menu distant orbit camera [flwstg3]
		const camera = this._core.render?.camera;
		if (camera) {
			this._camera_home = camera.position.clone();
		}

		this._core.scene.environment.floorstyle("floor", 0xffffff);
		this._core.scene.environment.shadowstyle(0x0, 0.5);
		this._floor_index = this._core.itembox.spawn("floor_item");
		this._toy_indices = [];
		for (let i = 0; i < TOY_STACK_COUNT; i++) {
			const toy_index = this._core.toybox.spawn(TOY_STACK_KEY);
			if (toy_index != null) {
				this._toy_indices.push(toy_index);
			}
		}
		this._positions_applied = false;

		this._core.ui.setstate("ui_settings_menu_vis");
		this._sync_settings_labels();
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "settings_btn_0") {
				// 2026-06-26, Composer: settings menu navigate events no parent [flwstg8]
				this._core.eventsbus.emit("flow.navigate", { to: "dev" });
				return;
			}
			// 2026-06-18, Composer: settings menu quality cycle button [flwstg4]
			if (event === "settings_btn_1") {
				this._settings.cycle_render_scale();
				this._settings.apply(this._core);
				this._sync_settings_labels();
				return;
			}
			// 2026-06-18, Composer: settings shadows tilt shift ao toggles [flwstg5]
			if (event === "settings_btn_2") {
				this._settings.toggle_shadows();
				this._settings.apply(this._core);
				this._sync_settings_labels();
				return;
			}
			if (event === "settings_btn_3") {
				this._settings.toggle_tilt_shift();
				this._settings.apply(this._core);
				this._sync_settings_labels();
				return;
			}
			if (event === "settings_btn_4") {
				this._settings.toggle_ao();
				this._settings.apply(this._core);
				this._sync_settings_labels();
				return;
			}
			// 2026-06-18, Composer: settings pixelate postprocess toggle [flwstg6]
			if (event === "settings_btn_5") {
				this._settings.toggle_pixelate();
				this._settings.apply(this._core);
				this._sync_settings_labels();
			}
		});
	}

	/**
	 * @param {number} dt
	 * @param {number} _rdt
	 * @returns {void}
	 */
	step(dt, _rdt) {
		this._apply_positions();
		this._update_camera_orbit(dt);
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		this._core.ui.delstate("ui_settings_menu_vis");

		for (let i = 0; i < this._toy_indices.length; i++) {
			this._core.toybox.despawn(this._toy_indices[i], true);
		}
		this._toy_indices = [];
		if (this._floor_index != null) {
			this._core.itembox.despawn(this._floor_index, true);
			this._floor_index = null;
		}
		this._core.scene.environment.floorstyle(null, 0xffffff);
		this._positions_applied = false;
		const camera = this._core.render?.camera;
		if (camera && this._camera_home) {
			camera.position.copy(this._camera_home);
			camera.lookAt(0, 0, 0);
		}
		this._camera_home = null;
	}

	/** @returns {void} */
	_apply_positions() {
		if (this._positions_applied) {
			return;
		}
		for (let i = 0; i < this._toy_indices.length; i++) {
			const item_index = this._core.toybox.get_item_index(this._toy_indices[i]);
			if (!this._core.scene.get_itementity(item_index)) {
				return;
			}
		}
		if (this._floor_index != null) {
			this._core.scene.set_itemposition(this._floor_index, 0, -0.05, 0);
		}
		for (let i = 0; i < this._toy_indices.length; i++) {
			const item_index = this._core.toybox.get_item_index(this._toy_indices[i]);
			this._core.scene.set_itemposition(item_index, 0, 0.5 + i, 0);
		}
		this._positions_applied = true;
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

		this._orbit_time += dt * ORBIT_SPEED;
		const x = Math.cos(this._orbit_time) * ORBIT_RADIUS;
		const z = Math.sin(this._orbit_time) * ORBIT_RADIUS;
		camera.position.set(x, ORBIT_HEIGHT, z);
		camera.lookAt(0, ORBIT_LOOK_Y, 0);
	}

	/** @returns {void} */
	_sync_settings_labels() {
		const labels = [
			{ index: 1, text: this._settings.quality_label() },
			{ index: 2, text: this._settings.shadows_label() },
			{ index: 3, text: this._settings.tilt_shift_label() },
			{ index: 4, text: this._settings.ao_label() },
			{ index: 5, text: this._settings.pixelate_label() },
		];
		for (let i = 0; i < labels.length; i++) {
			const { index, text } = labels[i];
			const element = this._core.ui.elements[`settings_btn_${index}_label`];
			if (element?.kind !== "text") {
				continue;
			}
			element.text.text = text;
			element.text.update();
		}
	}
}

export default SettingsMenuFlow;
// 2026-06-26, Composer: settings menu navigate events no parent [flwstg8]
// 2026-06-18, Composer: settings menu flow back to dev menu [flwstg7]
// 2026-06-18, Composer: settings menu floor toy stack [flwstg2]
// 2026-06-18, Composer: settings menu distant orbit camera [flwstg3]
// 2026-06-18, Composer: settings menu quality cycle button [flwstg4]
// 2026-06-18, Composer: settings shadows tilt shift ao toggles [flwstg5]
// 2026-06-18, Composer: settings pixelate postprocess toggle [flwstg6]