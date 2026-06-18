// Toy-scope root gateway: gameplay entity lifecycle over item link + blackboard/modules.
// Scope in: toys db spawn, per-frame step, despawn, module-driven dispose.
// Scope out: item physics/scene side effects (itembox/scene), module storage internals (modulebox/blackboard).
// Related: itembox.js, blackboard.js, modulebox.js, core.js, play.js, db_toys.pug
// Gateway role: index | Scope id: toy-scope | Flow id: tbx-lifecycle
// Downstream gateways: itembox.js (itm-lifecycle), modulebox.js (tbx-module), blackboard.js (tbx-bb-chunks)
// Related gateways: scene.js (itm-scene-sidefx, item.* listeners only)
//
// toy-scope patterns:
//   tbx-lifecycle     → toybox.js (this file) — toy mempool state machine, toy.* events
//   itm-lifecycle     → itembox.js — item mempool; touchpoint before toy init
//   itm-scene-sidefx  → scene.js — item.initialize/dispose → spawn_item/despawn_item
//   tbx-module        → modulebox.js + toys/* — module tick; storage via blackboard
//   tbx-bb-chunks     → blackboard.js — merged chunk pool; root via VAR_ENTITY_BB_ROOT
//
// touchpoints (core.step order): itembox.step → toybox.step → physics.step
//   spawn: toybox spawns item via itembox; stores VAR_ITEM_INDEX
//   init gate: toy init waits linked item INITIALIZED (item.initialize frame)
//   dispose cascade: toy.dispose → itembox.despawn(linked item)
//
// invariants: toy row ≠ item row; floor/items-only have no toy slot; playbox dt is seconds;
//   module configure runs after init_modules; lifespan converts dt to ms internally
//   despawn before toy init: !initialized && disposed → item despawn → DISPOSED_L2 (no toy.dispose)
//   bulk spawn/despawn: omit immediate; one itembox.step + toybox.step per frame drains pipeline
//   toy.* / item.* events pass index scalar; toy.update gated via eventsbus.has
//
// tbx-lifecycle flow:
// 1) spawn(toy_key) → allocate toy slot; itembox.spawn(conf.item); VAR_TOY_DB_ID, VAR_ITEM_INDEX, module flags; no bb yet
// 2) itembox.step → linked item item.initialize → scene.spawn_item (itm-scene-sidefx); toy still !initialized
// 3) toyupdate !initialized → wait item INITIALIZED → toy.initialize → ensure_root → init_modules → configure
// 4) toyupdate active → toy.update → modulebox.update(dt); modules may set toy DISPOSED (e.g. lifespan)
// 5) despawn(immediate?) → DISPOSED; next toyupdate: toy.dispose → itembox.despawn(item_index) → DISPOSED_L2
// 6) toyupdate DISPOSED_L2 → blackboard.dispose_entity → mempool.free toy slot
// Branches: immediate spawn/despawn runs toyupdate(0) same call; stop() despawn(all, immediate=true)
/** @namespace ty */
// 2026-06-14, Composer: toy-scope root gateway playbook [tbxgw1]
// 2026-06-14, Composer: toybox mempool item link blackboard [tbxbb1]
// 2026-06-14, Composer: modules blackboard after item initialized [tbxit1]
import logger from "../logger.js";
import Mempool, { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../core/mempool.js";
import Blackboard, { BB_INVALID } from "./blackboard.js";
import Modulebox, { VAR_FLAGS_MODULES, modulenames } from "./modulebox.js";

const TOY_ENTITY_BYTES = 16;
const TOY_POOL_SIZE = 256;
const VAR_TOY_DB_ID = 3;
const VAR_ITEM_INDEX = 4;
const VAR_ENTITY_BB_ROOT = 6;
const VAR_FLAG_INITIALIZED = 1;
const VAR_FLAG_DISPOSED = 3;
const VAR_FLAG_DISPOSED_L2 = 4;

/**
 * @class Toybox
 * @memberof pb.scene
 */
class Toybox {
	/**
	 * @param {import("../core/db.js").default} db
	 * @param {import("../core/eventsbus.js").default} eventsbus
	 * @param {import("./itembox.js").default} itembox
	 */
	constructor(db, eventsbus, itembox) {
		this._db = db;
		this._eventsbus = eventsbus;
		this._itembox = itembox;
		this.mempool = new Mempool();
		this.blackboard = new Blackboard(this.mempool, VAR_ENTITY_BB_ROOT);
		this.modulebox = new Modulebox(this.blackboard, this.mempool);
		/** @type {Record<number, Record<string, any>>} */
		this._toy_by_id = {};
	}

	/** @returns {this} */
	init() {
		// 2026-06-17, Composer: toybox pool alloc in init [tbxinit1]
		this.mempool.init(TOY_ENTITY_BYTES * 2, TOY_POOL_SIZE);
		this.blackboard.init();
		this.modulebox.init();
		this._build_toy_by_id();
		return this;
	}

	/** @returns {void} */
	start() {}

	stop() {
		if (!this.mempool.buffer) {
			return;
		}
		const mempool = this.mempool;
		for (let i = 0; i < mempool.chunk_size; i++) {
			if (mempool.read_flag(i, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
				this.despawn(i, true);
			}
		}
		this.blackboard.stop();
		this.mempool.dispose();
	}

	/** @returns {void} */
	dispose() {
		// 2026-06-17, Composer: toybox dispose unwinds start [tbxdsp1]
		this.stop();
	}

	/**
	 * @returns {void}
	 */
	_build_toy_by_id() {
		this._toy_by_id = {};
		const entry = this._db.get("toys");
		if (!entry) {
			return;
		}
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (conf?.id != null) {
				this._toy_by_id[conf.id] = conf;
			}
		}
	}

	/**
	 * @param {number} index
	 * @returns {Record<string, any>|undefined}
	 */
	get_toyconf(index) {
		const id = this.mempool.read_ui16(index, VAR_TOY_DB_ID);
		return this._toy_by_id[id];
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	get_item_index(index) {
		return this.mempool.read_ui16(index, VAR_ITEM_INDEX);
	}

	/**
	 * @param {number} index
	 * @returns {void}
	 */
	_init_slot(index) {
		const mempool = this.mempool;
		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE, true);
		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED, false);
		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED, false);
		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, false);
		mempool.write(index, VAR_FLAGS_MODULES, 0);
		mempool.write_ui16(index, VAR_ENTITY_BB_ROOT, BB_INVALID);
	}

	/**
	 * @param {number} index
	 * @param {Record<string, any>} conf
	 * @returns {void}
	 */
	_enable_modules(index, conf) {
		const modules = conf.modules;
		if (!modules) {
			return;
		}
		for (const i in modules) {
			const name = modules[i];
			const flag = modulenames[name];
			if (flag != null) {
				this.mempool.write_flag(index, VAR_FLAGS_MODULES, flag, true);
			}
		}
	}

	/**
	 * @param {number} item_index
	 * @returns {boolean}
	 */
	_is_item_initialized(item_index) {
		const item_pool = this._itembox.mempool;
		if (!item_pool.read_flag(item_index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return false;
		}
		return item_pool.read_flag(item_index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED);
	}

	/**
	 * @param {string} key
	 * @param {boolean} [immediate]
	 * @returns {number|null}
	 */
	spawn(key, immediate = false) {
		const conf = this._db.get("toys")?.getconfig(key);
		if (!conf) {
			logger.error(`Toybox::spawn "${key}" error: no toy declared`);
			return null;
		}
		return this.spawn_conf(conf, immediate);
	}

	/**
	 * @param {number} id
	 * @param {boolean} [immediate]
	 * @returns {number|null}
	 */
	spawn_id(id, immediate = false) {
		const conf = this._toy_by_id[id];
		if (!conf) {
			logger.error(`Toybox::spawn_id ${id} error: no toy declared`);
			return null;
		}
		return this.spawn_conf(conf, immediate);
	}

	/**
	 * @param {Record<string, any>} conf
	 * @param {boolean} [immediate]
	 * @returns {number|null}
	 */
	spawn_conf(conf, immediate = false) {
		// tbx-lifecycle step 1)
		if (!conf.item) {
			logger.error(`Toybox::spawn_conf error: no item declared`);
			return null;
		}

		const item_conf = this._itembox.get_itemconf_by_key(conf.item);
		if (!item_conf) {
			logger.error(`Toybox::spawn_conf error: no item "${conf.item}" declared`);
			return null;
		}

		const index = this.mempool.allocate();
		if (index == null) {
			logger.error(`Toybox::spawn_conf error: pool out of bounds`);
			return null;
		}

		const item_index = this._itembox.spawn_conf(item_conf, immediate);
		if (item_index == null) {
			this.mempool.free(index);
			return null;
		}

		this.mempool.write_ui16(index, VAR_TOY_DB_ID, conf.id ?? 0);
		this.mempool.write_ui16(index, VAR_ITEM_INDEX, item_index);
		this._init_slot(index);
		this._enable_modules(index, conf);

		if (immediate) {
			this.toyupdate(0, index);
		}

		return index;
	}

	/**
	 * @param {number} index
	 * @param {boolean} [immediate]
	 * @returns {void}
	 */
	despawn(index, immediate = false) {
		// tbx-lifecycle step 5)
		const mempool = this.mempool;
		if (!mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return;
		}

		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED, true);
		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, false);

		if (immediate) {
			this.toyupdate(0, index);
		}
	}

	/**
	 * @param {number} dt
	 * @param {number} index
	 * @returns {void}
	 */
	toyupdate(dt, index) {
		const mempool = this.mempool;
		if (!mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return;
		}
		if (mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2)) {
			// tbx-lifecycle step 6)
			this.blackboard.dispose_entity(index);
			mempool.free(index);
			return;
		}

		const initialized = mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED);
		const disposed = mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED);

		if (initialized && disposed) {
			// tbx-lifecycle step 5)
			if (this._eventsbus.has("toy.dispose")) {
				this._eventsbus.emit("toy.dispose", index);
			}
			const item_index = this.get_item_index(index);
			this._itembox.despawn(item_index);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED, false);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED, true);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, true);
			return;
		}

		if (!initialized && !disposed) {
			// tbx-lifecycle step 3)
			const item_index = this.get_item_index(index);
			// 2026-06-14, Composer: modules blackboard after item initialized [tbxit1]
			if (!this._is_item_initialized(item_index)) {
				return;
			}
			this._eventsbus.emit("toy.initialize", index);
			this.blackboard.ensure_root(index);
			this.modulebox.init_modules(index);
			const conf = this.get_toyconf(index);
			if (conf) {
				this.modulebox.configure(index, conf);
			}
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED, true);
			return;
		}

		// 2026-06-14, Composer: despawn before init still cascades item [tbxds1]
// 2026-06-14, Composer: spawn_conf scalar events gated toy.update [tbxhp1]
		if (!initialized && disposed) {
			const item_index = this.get_item_index(index);
			this._itembox.despawn(item_index);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, true);
			return;
		}

		if (this._eventsbus.has("toy.update")) {
			this._eventsbus.emit("toy.update", index);
		}
		// tbx-lifecycle step 4)
		this.modulebox.update(dt, index);
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	step(dt, _rdt) {
		const mempool = this.mempool;
		for (let i = 0; i < mempool.chunk_size; i++) {
			this.toyupdate(dt, i);
		}
	}
}

export default Toybox;
export {
	VAR_FLAGS_A,
	VAR_FLAG_ACTIVE,
	VAR_FLAG_INITIALIZED,
	VAR_FLAG_DISPOSED,
	VAR_FLAG_DISPOSED_L2,
	VAR_TOY_DB_ID,
	VAR_ITEM_INDEX,
	VAR_ENTITY_BB_ROOT,
};
// 2026-06-14, Composer: toybox mempool item link blackboard [tbxbb1]
// 2026-06-14, Composer: modules blackboard after item initialized [tbxit1]
// 2026-06-14, Composer: toy-scope root gateway playbook [tbxgw1]
// 2026-06-14, Composer: despawn before init still cascades item [tbxds1]
// 2026-06-14, Composer: spawn_conf scalar events gated toy.update [tbxhp1]
// 2026-06-17, Composer: toybox dispose unwinds start [tbxdsp1]
// 2026-06-17, Composer: toybox pool alloc in init [tbxinit1]
