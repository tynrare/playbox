/** @namespace ty */
// 2026-06-14, Composer: dev_debug_state settings with ui setstate [stgs1]
// 2026-06-14, Composer: rename ui_dev_states to ui_debug_enabled [stgs2]
// 2026-06-18, Composer: render_scale quality cycle persist [stgs3]
// 2026-06-18, Composer: shadows tilt shift ao toggles persist [stgs4]
// 2026-06-18, Composer: pixelate postprocess toggle persist [stgs5]
import Datawork from "../core/datawork.js";

const UI_DEBUG_ENABLED = "ui_debug_enabled";
const RENDER_SCALE_LEVELS = [0.25, 0.5, 1.0];
const RENDER_SCALE_DEFAULT = 1.0;

/**
 * @class Settings
 * @memberof pb.play
 */
class Settings {
	/**
	 * @param {Datawork} datawork
	 */
	constructor(datawork) {
		this._datawork = datawork;
	}

	/**
	 * @returns {boolean}
	 */
	get dev_debug_state() {
		return this._datawork.load("dev_debug_state") == 2;
	}

	/**
	 * @param {boolean} v
	 */
	set dev_debug_state(v) {
		this._datawork.save("dev_debug_state", v ? 2 : 1);
	}

	/**
	 * @returns {number}
	 */
	get render_scale() {
		const v = Number(this._datawork.load("render_scale"));
		if (!RENDER_SCALE_LEVELS.includes(v)) {
			return RENDER_SCALE_DEFAULT;
		}
		return v;
	}

	/**
	 * @param {number} v
	 */
	set render_scale(v) {
		const scale = Number(v);
		if (!RENDER_SCALE_LEVELS.includes(scale)) {
			return;
		}
		this._datawork.save("render_scale", scale);
	}

	/**
	 * @returns {void}
	 */
	cycle_render_scale() {
		const levels = RENDER_SCALE_LEVELS;
		let i = levels.indexOf(this.render_scale);
		if (i < 0) {
			i = levels.length - 1;
		}
		this.render_scale = levels[(i + 1) % levels.length];
	}

	/**
	 * @returns {string}
	 */
	quality_label() {
		const scale = this.render_scale;
		return `Quality ${Number.isInteger(scale) ? scale : scale}`;
	}

	/**
	 * @returns {boolean}
	 */
	get shadows() {
		return this._load_bool("shadows", true);
	}

	/**
	 * @param {boolean} v
	 */
	set shadows(v) {
		this._save_bool("shadows", v);
	}

	/**
	 * @returns {boolean}
	 */
	get tilt_shift() {
		return this._load_bool("tilt_shift", false);
	}

	/**
	 * @param {boolean} v
	 */
	set tilt_shift(v) {
		this._save_bool("tilt_shift", v);
	}

	/**
	 * @returns {boolean}
	 */
	get ao() {
		return this._load_bool("ao", false);
	}

	/**
	 * @param {boolean} v
	 */
	set ao(v) {
		this._save_bool("ao", v);
	}

	/**
	 * @returns {void}
	 */
	toggle_shadows() {
		this.shadows = !this.shadows;
	}

	/**
	 * @returns {void}
	 */
	toggle_tilt_shift() {
		this.tilt_shift = !this.tilt_shift;
	}

	/**
	 * @returns {void}
	 */
	toggle_ao() {
		this.ao = !this.ao;
	}

	/**
	 * @returns {string}
	 */
	shadows_label() {
		return `Shadows ${this.shadows ? "On" : "Off"}`;
	}

	/**
	 * @returns {string}
	 */
	tilt_shift_label() {
		return `Tilt Shift ${this.tilt_shift ? "On" : "Off"}`;
	}

	/**
	 * @returns {string}
	 */
	ao_label() {
		return `AO ${this.ao ? "On" : "Off"}`;
	}

	/**
	 * @returns {boolean}
	 */
	get pixelate() {
		return this._load_bool("pixelate", false);
	}

	/**
	 * @param {boolean} v
	 */
	set pixelate(v) {
		this._save_bool("pixelate", v);
	}

	/**
	 * @returns {void}
	 */
	toggle_pixelate() {
		this.pixelate = !this.pixelate;
	}

	/**
	 * @returns {string}
	 */
	pixelate_label() {
		return `Pixelate ${this.pixelate ? "On" : "Off"}`;
	}

	/**
	 * @param {string} key
	 * @param {boolean} default_on
	 * @returns {boolean}
	 */
	_load_bool(key, default_on) {
		const v = this._datawork.load(key);
		if (v == null) {
			return default_on;
		}
		return v === 2;
	}

	/**
	 * @param {string} key
	 * @param {boolean} on
	 * @returns {void}
	 */
	_save_bool(key, on) {
		this._datawork.save(key, on ? 2 : 1);
	}

	/**
	 * @param {import("../core/core.js").default} core
	 * @returns {void}
	 */
	start(core) {
		this.apply(core);
	}

	/**
	 * @param {import("../core/core.js").default} core
	 * @returns {void}
	 */
	apply(core) {
		const on = this.dev_debug_state;
		core.physics.config.debug = on;
		core.physics.sync_debug_draw(on);
		if (on) {
			core.ui.setstate(UI_DEBUG_ENABLED);
		} else {
			core.ui.delstate(UI_DEBUG_ENABLED);
		}
		// 2026-06-18, Composer: render_scale quality cycle persist [stgs3]
		core.draw.set_render_scale(this.render_scale);
		// 2026-06-18, Composer: shadows tilt shift ao toggles persist [stgs4]
		core.scene.environment.set_shadows_enabled(this.shadows);
		core.draw.set_pixelate_enabled(this.pixelate);
		core.draw.set_ultra_ao_enabled(this.ao);
		// 2026-06-19, Composer: quality via render_scale only [stgs9]
		core.draw.set_ultra_tiltshift_enabled(this.tilt_shift);
	}
}

export default Settings;
export { RENDER_SCALE_LEVELS, RENDER_SCALE_DEFAULT };
// 2026-06-14, Composer: dev_debug_state settings with ui setstate [stgs1]
// 2026-06-14, Composer: rename ui_dev_states to ui_debug_enabled [stgs2]
// 2026-06-18, Composer: render_scale quality cycle persist [stgs3]
// 2026-06-18, Composer: shadows tilt shift ao toggles persist [stgs4]
// 2026-06-18, Composer: pixelate postprocess toggle persist [stgs5]
// 2026-06-19, Composer: quality via render_scale only [stgs9]
// 2026-06-18, Composer: independent pixelate and ao toggles [stgs8]
