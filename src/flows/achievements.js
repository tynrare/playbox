/** @namespace ty */
// Purpose: achievements flow clones one ui template row for each db achievements entry.

import FlowBase from "../core/flowbase.js";
import { cache } from "../math.js";

const TEMPLATE_PREFIX = "achievements_tpl";
const ROW_PREFIX = "achievements_row";
const ROW_STEP = 14;
const ACHIEVEMENT_OBTAIN_EVENT_PREFIX = "achievements.obtain.";
const ACHIEVEMENT_STATE_LOCKED = "locked";
const ACHIEVEMENT_STATE_OPEN = "open";
const ACHIEVEMENT_STATE_ACHIEVED = "achieved";
const ACHIEVEMENT_STATE_OBTAINED = "obtained";
const ACHIEVEMENT_ACHIEVED_GREEN = 0x00ff00;

/**
 * @class AchievementsFlow
 * @memberof pb.flows
 */
class AchievementsFlow extends FlowBase {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {{ embedded?: boolean }} [options]
	 */
	constructor(core, options = {}) {
		super(core);
		this._embedded = options.embedded === true;
	}

	/** @returns {this} */
	init() {
		/** @type {number|null} */
		this._ui_click_id = null;
		/** @type {number|null} */
		this._progress_id = null;
		/** @type {string[]} */
		this._dynamic_keys = [];
		/** @type {Record<string, { key: string, mode: string, type: string, target: number, state: string, current: number, panelKey: string, spriteKey: string, titleKey: string, descriptionKey: string, progressKey: string }>} */
		this._rows = {};
		/** @type {{ panel: Record<string, any>, sprite: Record<string, any>, title: Record<string, any>, description: Record<string, any>, progress: Record<string, any> }|null} */
		this._templates_conf = null;
		return this;
	}

	/** @returns {void} */
	start() {
		this._core.ui.setstate("ui_achievements_vis");
		if (this._embedded) {
			// 2026-07-01, Codex 5.3: embedded achievements hide close cross state [achemb1]
			this._core.ui.setstate("ui_achievements_embedded");
		}
		this._spawn_rows();
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "achievements_close") {
				if (!this._embedded) {
					this._core.eventsbus.emit("flow.navigate", { to: "root" });
				}
				return;
			}
			if (event.startsWith(ACHIEVEMENT_OBTAIN_EVENT_PREFIX)) {
				this._on_row_click(event.slice(ACHIEVEMENT_OBTAIN_EVENT_PREFIX.length));
			}
		});
		this._progress_id = this._core.eventsbus.on(
			"achievement.progress",
			this._on_achievement_progress.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
		}
		if (this._progress_id != null) {
			this._core.eventsbus.off(this._progress_id);
			this._progress_id = null;
		}
		this._dispose_rows();
		if (this._embedded) {
			this._core.ui.delstate("ui_achievements_embedded");
		}
		this._core.ui.delstate("ui_achievements_vis");
	}

	/**
	 * @returns {{ panel: any, sprite: any, title: any, description: any, progress: any }|null}
	 */
	_template_elements() {
		const ui = this._core.ui;
		const panel = ui.elements[`${TEMPLATE_PREFIX}_panel`];
		const sprite = ui.elements[`${TEMPLATE_PREFIX}_sprite`];
		const title = ui.elements[`${TEMPLATE_PREFIX}_title`];
		const description = ui.elements[`${TEMPLATE_PREFIX}_description`];
		const progress = ui.elements[`${TEMPLATE_PREFIX}_progress`];
		if (
			panel?.kind !== "panel"
			|| sprite?.kind !== "sprite"
			|| title?.kind !== "text"
			|| description?.kind !== "text"
			|| progress?.kind !== "text"
		) {
			return null;
		}
		return { panel, sprite, title, description, progress };
	}

	/**
	 * @param {string} key
	 * @returns {void}
	 */
	_show_dynamic(key) {
		const ui = this._core.ui;
		const element = ui.elements[key];
		if (!element) {
			return;
		}
		element.statecount = 1;
		ui._apply_element_visible(element);
	}

	/**
	 * @param {string} key
	 * @param {string} panelKey
	 * @returns {void}
	 */
	_link_to_panel(key, panelKey) {
		const ui = this._core.ui;
		const element = ui.elements[key];
		const panel = ui.elements[panelKey];
		if (!element || !panel) {
			return;
		}
		// 2026-07-01, Codex 5.3: dynamic ui children must rebind pivot chain [achflow3]
		element.x.pivot = panel.x;
		element.y.pivot = panel.y;
		element.rx.pivot = panel.rx;
		element.ry.pivot = panel.ry;
		element.z.pivot = panel.z;
	}

	/** @returns {void} */
	_spawn_rows() {
		const templates = this._template_elements();
		const entry = this._core.db.get("achievements");
		if (!templates || !entry) {
			return;
		}

		const ui = this._core.ui;
		this._templates_conf = {
			panel: { ...templates.panel.conf },
			sprite: { ...templates.sprite.conf },
			title: { ...templates.title.conf },
			description: { ...templates.description.conf },
			progress: { ...templates.progress.conf },
		};
		let row = 0;
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (!conf) {
				continue;
			}
			const state = conf.state ?? ACHIEVEMENT_STATE_OPEN;
			if (state === ACHIEVEMENT_STATE_LOCKED) {
				continue;
			}

			const rowKey = `${ROW_PREFIX}_${row}`;
			const y = (templates.panel.conf.y ?? 0) - (row * ROW_STEP);

			// 2026-07-01, Codex 5.3: dynamic row clone from single ui template [achflow1]
			const panelConf = {
				...templates.panel.conf,
				y,
				name: `${rowKey}_panel`,
				interactive: true,
				event: `${ACHIEVEMENT_OBTAIN_EVENT_PREFIX}${key}`,
			};
			ui._make_panel(`${rowKey}_panel`, panelConf);
			this._dynamic_keys.push(`${rowKey}_panel`);
			this._show_dynamic(`${rowKey}_panel`);

			const spriteConf = {
				...templates.sprite.conf,
				pivot: `${rowKey}_panel`,
				sprite: conf.sprite ?? templates.sprite.conf.sprite,
				name: `${rowKey}_sprite`,
			};
			ui._make_sprite(`${rowKey}_sprite`, spriteConf);
			this._link_to_panel(`${rowKey}_sprite`, `${rowKey}_panel`);
			this._dynamic_keys.push(`${rowKey}_sprite`);
			this._show_dynamic(`${rowKey}_sprite`);

			const titleConf = {
				...templates.title.conf,
				pivot: `${rowKey}_panel`,
				text: conf.title ?? templates.title.conf.text,
				name: `${rowKey}_title`,
			};
			ui._make_text(`${rowKey}_title`, titleConf);
			this._link_to_panel(`${rowKey}_title`, `${rowKey}_panel`);
			this._dynamic_keys.push(`${rowKey}_title`);
			this._show_dynamic(`${rowKey}_title`);

			const descriptionConf = {
				...templates.description.conf,
				pivot: `${rowKey}_panel`,
				text: conf.description ?? templates.description.conf.text,
				name: `${rowKey}_description`,
			};
			ui._make_text(`${rowKey}_description`, descriptionConf);
			this._link_to_panel(`${rowKey}_description`, `${rowKey}_panel`);
			this._dynamic_keys.push(`${rowKey}_description`);
			this._show_dynamic(`${rowKey}_description`);

			const target = Number(conf.target ?? 0);
			const progressConf = {
				...templates.progress.conf,
				pivot: `${rowKey}_panel`,
				text: `0/${target}`,
				name: `${rowKey}_progress`,
			};
			ui._make_text(`${rowKey}_progress`, progressConf);
			this._link_to_panel(`${rowKey}_progress`, `${rowKey}_panel`);
			this._dynamic_keys.push(`${rowKey}_progress`);
			this._show_dynamic(`${rowKey}_progress`);
			this._rows[key] = {
				key,
				mode: conf.mode ?? "collect",
				type: conf.type ?? "",
				target: Number.isFinite(target) ? target : 0,
				state,
				current: 0,
				panelKey: `${rowKey}_panel`,
				spriteKey: `${rowKey}_sprite`,
				titleKey: `${rowKey}_title`,
				descriptionKey: `${rowKey}_description`,
				progressKey: `${rowKey}_progress`,
			};
			this._apply_row_visual(this._rows[key]);
			row++;
		}
	}

	/**
	 * @param {string} key
	 * @returns {void}
	 */
	_on_row_click(key) {
		const row = this._rows[key];
		if (!row || row.state !== ACHIEVEMENT_STATE_ACHIEVED) {
			return;
		}
		row.state = ACHIEVEMENT_STATE_OBTAINED;
		this._apply_row_visual(row);
		// 2026-07-01, Codex 5.3: emulator achievements click emits obtain payload [achclk1]
		this._core.eventsbus.emit("achievement.obtain", {
			key: row.key,
			mode: row.mode,
			type: row.type,
			current: row.current,
			target: row.target,
			state: row.state,
		});
	}

	/**
	 * @param {{ key?: string, current?: number, target?: number, state?: string }} payload
	 * @returns {void}
	 */
	_on_achievement_progress(payload) {
		const key = payload?.key;
		if (!key) {
			return;
		}
		const row = this._rows[key];
		if (!row) {
			return;
		}
		if (payload.target != null && Number.isFinite(payload.target)) {
			row.target = payload.target;
		}
		if (payload.current != null && Number.isFinite(payload.current)) {
			row.current = payload.current;
		}
		if (payload.state) {
			row.state = payload.state;
		}
		if (row.state === ACHIEVEMENT_STATE_LOCKED) {
			this._set_row_glow(row, 0);
			return;
		}
		this._set_progress_text(row);
		this._apply_row_visual(row);
	}

	/**
	 * @param {{ key: string, state: string, panelKey: string }} row
	 * @returns {void}
	 */
	_apply_row_visual(row) {
		const ui = this._core.ui;
		const panel = ui.elements[row.panelKey];
		if (!panel || panel.kind !== "panel" || !this._templates_conf) {
			return;
		}
		if (row.state === ACHIEVEMENT_STATE_OBTAINED) {
			this._set_row_glow(row, 0);
			return;
		}
		this._set_row_glow(row, this._templates_conf.panel.glow ?? 1);
		panel.colorb = row.state === ACHIEVEMENT_STATE_ACHIEVED
			? ACHIEVEMENT_ACHIEVED_GREEN
			: (this._templates_conf.panel.colorb ?? panel.colorb);
		ui._apply_panel_uniforms(panel);
		this._set_progress_text(row);
	}

	/**
	 * @param {{ panelKey: string, spriteKey: string, titleKey: string, descriptionKey: string, progressKey: string }} row
	 * @param {number} glow
	 * @returns {void}
	 */
	_set_row_glow(row, glow) {
		const ui = this._core.ui;
		const keys = [
			row.panelKey,
			row.spriteKey,
			row.titleKey,
			row.descriptionKey,
			row.progressKey,
		];
		for (let i = 0; i < keys.length; i++) {
			const element = ui.elements[keys[i]];
			if (!element) {
				continue;
			}
			if (element.kind === "panel") {
				element.glow = glow;
				ui._apply_panel_uniforms(element);
				continue;
			}
			if (element.kind === "sprite") {
				element.glow = glow;
				const colorb = element.conf?.colorb ?? 0xffffff;
				element.mesh.setUniform(
					"emissive",
					cache.color0.setHex(colorb).multiplyScalar(glow),
				);
				continue;
			}
			if (element.kind === "text") {
				element.text.glow = glow;
				element.text.update();
			}
		}
	}

	/**
	 * @param {{ progressKey: string, current: number, target: number }} row
	 * @returns {void}
	 */
	_set_progress_text(row) {
		const progress = this._core.ui.elements[row.progressKey];
		if (!progress || progress.kind !== "text") {
			return;
		}
		progress.text.text = `${row.current}/${row.target}`;
		progress.text.update();
	}

	/** @returns {void} */
	_dispose_rows() {
		const ui = this._core.ui;
		for (let i = 0; i < this._dynamic_keys.length; i++) {
			const key = this._dynamic_keys[i];
			const element = ui.elements[key];
			if (!element) {
				continue;
			}
			if (element.kind === "text") {
				element.text.remove();
			} else {
				if (element.kind === "panel") {
					delete ui._panels_id_tokey[element.mesh.id];
				}
				element.mesh.remove();
			}
			delete ui.elements[key];
		}
		this._dynamic_keys.length = 0;
		this._rows = {};
		this._templates_conf = null;
	}
}

export default AchievementsFlow;
// 2026-07-01, Codex 5.3: dynamic row clone from single ui template [achflow1]
// 2026-07-01, Codex 5.3: dynamic ui children must rebind pivot chain [achflow3]
// 2026-07-01, Codex 5.3: embedded achievements hide close cross state [achemb1]
// 2026-07-01, Codex 5.3: emulator achievements click emits obtain payload [achclk1]
