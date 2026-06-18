/** @namespace ty */
// 2026-06-14, Composer: itembox mempool data worker eventbus [itmbx1]
// 2026-06-14, Composer: despawn before init advances to DISPOSED_L2 [itmds1]
// 2026-06-14, Composer: spawn_conf scalar item events no item.update [itmhp1]
import logger from "../logger.js";
import Mempool, { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../core/mempool.js";

const ITEM_ENTITY_BYTES = 16;
const ITEM_POOL_SIZE = 256;
const VAR_ITEM_DB_ID = 3;
const VAR_BODY_ID = 4;
const VAR_FLAG_INITIALIZED = 1;
const VAR_FLAG_DISPOSED = 3;
const VAR_FLAG_DISPOSED_L2 = 4;

/**
 * @class Itembox
 * @memberof pb.scene
 */
class Itembox {
	/**
	 * @param {import("../core/db.js").default} db
	 * @param {import("../core/eventsbus.js").default} eventsbus
	 */
	constructor(db, eventsbus) {
		this._db = db;
		this._eventsbus = eventsbus;
		this.mempool = new Mempool();
		/** @type {Record<number, Record<string, any>>} */
		this._item_by_id = {};
		/** @type {Record<string, Record<string, any>>} */
		this._item_by_key = {};
	}

	/** @returns {this} */
	init() {
		// 2026-06-17, Composer: itembox pool alloc in init [itminit1]
		this.mempool.init(ITEM_ENTITY_BYTES * 2, ITEM_POOL_SIZE);
		this._build_item_by_id();
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
		this.mempool.dispose();
	}

	/** @returns {void} */
	dispose() {
		// 2026-06-17, Composer: itembox dispose unwinds start [itmdsp1]
		this.stop();
	}

	/**
	 * @returns {void}
	 */
	_build_item_by_id() {
		this._item_by_id = {};
		this._item_by_key = {};
		const entry = this._db.get("items");
		if (!entry) {
			return;
		}
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			this._item_by_key[key] = conf;
			if (conf?.id != null) {
				this._item_by_id[conf.id] = conf;
			}
		}
	}

	/**
	 * @param {string} key
	 * @returns {Record<string, any>|undefined}
	 */
	get_itemconf_by_key(key) {
		return this._item_by_key[key];
	}

	/**
	 * @param {number} index
	 * @returns {Record<string, any>|undefined}
	 */
	get_itemconf(index) {
		const id = this.mempool.read_ui16(index, VAR_ITEM_DB_ID);
		return this._item_by_id[id];
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
	}

	/**
	 * @param {string} key
	 * @param {boolean} [immediate]
	 * @returns {number|null}
	 */
	spawn(key, immediate = false) {
		const conf = this.get_itemconf_by_key(key);
		if (!conf) {
			logger.error(`Itembox::spawn "${key}" error: no item declared`);
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
		const conf = this._item_by_id[id];
		if (!conf) {
			logger.error(`Itembox::spawn_id ${id} error: no item declared`);
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
		if (!conf.body) {
			logger.error(`Itembox::spawn_conf error: no body declared`);
			return null;
		}

		const index = this.mempool.allocate();
		if (index == null) {
			logger.error(`Itembox::spawn_conf error: pool out of bounds`);
			return null;
		}

		this.mempool.write_ui16(index, VAR_ITEM_DB_ID, conf.id ?? 0);
		this._init_slot(index);

		if (immediate) {
			this.itemupdate(0, index);
		}

		return index;
	}

	/**
	 * @param {number} index
	 * @param {boolean} [immediate]
	 * @returns {void}
	 */
	despawn(index, immediate = false) {
		const mempool = this.mempool;
		if (!mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return;
		}

		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED, true);
		mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, false);

		if (immediate) {
			this.itemupdate(0, index);
		}
	}

	/**
	 * @param {number} dt
	 * @param {number} index
	 * @returns {void}
	 */
	itemupdate(dt, index) {
		const mempool = this.mempool;
		if (!mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return;
		}
		if (mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2)) {
			mempool.free(index);
			return;
		}

		const initialized = mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED);
		const disposed = mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED);

		if (initialized && disposed) {
			this._eventsbus.emit("item.dispose", index);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED, false);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED, true);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, true);
			return;
		}

		if (!initialized && !disposed) {
			// tbx-lifecycle step 2) item.initialize gate for toy init
			this._eventsbus.emit("item.initialize", index);
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED, true);
			return;
		}

		// 2026-06-14, Composer: despawn before init advances to DISPOSED_L2 [itmds1]
		if (!initialized && disposed) {
			mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED_L2, true);
			return;
		}
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	step(dt, _rdt) {
		const mempool = this.mempool;
		for (let i = 0; i < mempool.chunk_size; i++) {
			this.itemupdate(dt, i);
		}
	}
}

export default Itembox;
export {
	VAR_FLAGS_A,
	VAR_FLAG_ACTIVE,
	VAR_FLAG_INITIALIZED,
	VAR_FLAG_DISPOSED,
	VAR_FLAG_DISPOSED_L2,
	VAR_ITEM_DB_ID,
	VAR_BODY_ID,
};
// 2026-06-14, Composer: itembox mempool data worker eventbus [itmbx1]
// 2026-06-14, Composer: despawn before init advances to DISPOSED_L2 [itmds1]
// 2026-06-14, Composer: spawn_conf scalar item events no item.update [itmhp1]
// 2026-06-17, Composer: itembox dispose unwinds start [itmdsp1]
// 2026-06-17, Composer: itembox pool alloc in init [itminit1]
