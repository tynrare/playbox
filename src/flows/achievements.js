/** @namespace ty */
// Purpose: achievements flow clones one ui template row for each db achievements entry.

import FlowBase from "../core/flowbase.js";

const TEMPLATE_PREFIX = "achievements_tpl";
const ROW_PREFIX = "achievements_row";
const ROW_STEP = 14;

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
		/** @type {string[]} */
		this._dynamic_keys = [];
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
		if (this._embedded) {
			return;
		}
		this._ui_click_id = this._core.eventsbus.on("ui.click", ({ event }) => {
			if (event === "achievements_close") {
				this._core.eventsbus.emit("flow.navigate", { to: "root" });
			}
		});
	}

	/** @returns {void} */
	stop() {
		if (this._ui_click_id != null) {
			this._core.eventsbus.off(this._ui_click_id);
			this._ui_click_id = null;
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
		let row = 0;
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (!conf) {
				continue;
			}

			const rowKey = `${ROW_PREFIX}_${row}`;
			const y = (templates.panel.conf.y ?? 0) - (row * ROW_STEP);

			// 2026-07-01, Codex 5.3: dynamic row clone from single ui template [achflow1]
			const panelConf = { ...templates.panel.conf, y, name: `${rowKey}_panel` };
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

			const value = conf.value ?? 0;
			const target = conf.target ?? 0;
			const progressConf = {
				...templates.progress.conf,
				pivot: `${rowKey}_panel`,
				text: `${value}/${target}`,
				name: `${rowKey}_progress`,
			};
			ui._make_text(`${rowKey}_progress`, progressConf);
			this._link_to_panel(`${rowKey}_progress`, `${rowKey}_panel`);
			this._dynamic_keys.push(`${rowKey}_progress`);
			this._show_dynamic(`${rowKey}_progress`);
			row++;
		}
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
	}
}

export default AchievementsFlow;
// 2026-07-01, Codex 5.3: dynamic row clone from single ui template [achflow1]
// 2026-07-01, Codex 5.3: dynamic ui children must rebind pivot chain [achflow3]
// 2026-07-01, Codex 5.3: embedded achievements hide close cross state [achemb1]
