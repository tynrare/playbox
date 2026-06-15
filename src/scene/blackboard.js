/** @namespace ty */
// 2026-06-14, Composer: blackboard merged chunk pool for modules [bbpl1]
import Mempool, { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../core/mempool.js";

const BB_INVALID = 0xffff;
const BB_KEY_MODULE = 0;
const BB_SLOT_BASE = 2;
const BB_MAX_KEYS = 8;
const VAR_BB_CHUNK_KEY = 1;
const BB_CHUNK_BYTES = 32;
const BB_POOL_SIZE = 2048;
const VAR_MTBL_FLAGS = 3;
const VAR_FLAG_INITIALIZED = 1;
const VAR_FLAG_DISPOSED = 3;

/** Module flags whose component chunks must be freed on dispose. */
const BB_MODULE_FLAGS = [0];

/**
 * @class Blackboard
 * @memberof pb.scene
 */
class Blackboard {
	/**
	 * @param {Mempool} entity_pool
	 * @param {number} var_entity_bb_root
	 */
	constructor(entity_pool, var_entity_bb_root) {
		this._entity_pool = entity_pool;
		this._var_entity_bb_root = var_entity_bb_root;
		this._bb_pool = new Mempool();
		this._started = false;
	}

	get chunk_pool() {
		return this._bb_pool;
	}

	ensure() {
		if (this._started) {
			return;
		}
		this._bb_pool.init(BB_CHUNK_BYTES * 2, BB_POOL_SIZE);
		this._started = true;
	}

	stop() {
		if (!this._started) {
			return;
		}
		this._bb_pool.dispose();
		this._started = false;
	}

	/**
	 * @returns {number}
	 */
	spawn_chunk() {
		if (!this._started) {
			return BB_INVALID;
		}
		const index = this._bb_pool.allocate();
		return index ?? BB_INVALID;
	}

	/**
	 * @param {number} chunk_index
	 * @returns {void}
	 */
	free_chunk(chunk_index) {
		if (chunk_index === BB_INVALID) {
			return;
		}
		this._bb_pool.free(chunk_index);
	}

	/**
	 * @param {number} entity_index
	 * @returns {number}
	 */
	ensure_root(entity_index) {
		const entity = this._entity_pool;
		let root = entity.read_ui16(entity_index, this._var_entity_bb_root);
		if (root !== BB_INVALID && root !== 0) {
			const pool = this._bb_pool;
			if (pool.read_flag(root, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
				return root;
			}
		}
		root = this.spawn_chunk();
		if (root === BB_INVALID) {
			return BB_INVALID;
		}
		for (let k = 0; k < BB_MAX_KEYS; k++) {
			this._bb_pool.write_ui16(root, BB_SLOT_BASE + k, BB_INVALID);
		}
		entity.write_ui16(entity_index, this._var_entity_bb_root, root);
		return root;
	}

	/**
	 * @param {number} entity_index
	 * @param {number} key_index
	 * @returns {number}
	 */
	ensure_slot(entity_index, key_index) {
		const root = this.ensure_root(entity_index);
		if (root === BB_INVALID || key_index >= BB_MAX_KEYS) {
			return BB_INVALID;
		}
		const pool = this._bb_pool;
		const slot_field = BB_SLOT_BASE + key_index;
		let child = pool.read_ui16(root, slot_field);
		if (child !== BB_INVALID) {
			return child;
		}
		child = this.spawn_chunk();
		if (child === BB_INVALID) {
			return BB_INVALID;
		}
		pool.write_ui16(child, VAR_BB_CHUNK_KEY, key_index);
		pool.write_ui16(root, slot_field, child);
		return child;
	}

	/**
	 * @param {number} entity_index
	 * @param {number} key_index
	 * @returns {number}
	 */
	get_slot(entity_index, key_index) {
		const entity = this._entity_pool;
		const root = entity.read_ui16(entity_index, this._var_entity_bb_root);
		if (root === BB_INVALID || key_index >= BB_MAX_KEYS) {
			return BB_INVALID;
		}
		return this._bb_pool.read_ui16(root, BB_SLOT_BASE + key_index);
	}

	/**
	 * @param {number} entity_index
	 * @param {number} key_index
	 * @param {number} field
	 * @returns {number}
	 */
	read(entity_index, key_index, field) {
		const child = this.get_slot(entity_index, key_index);
		if (child === BB_INVALID) {
			return 0;
		}
		return this._bb_pool.read_ui16(child, field);
	}

	/**
	 * @param {number} entity_index
	 * @param {number} key_index
	 * @param {number} field
	 * @param {number} v
	 * @returns {void}
	 */
	write(entity_index, key_index, field, v) {
		const child = this.ensure_slot(entity_index, key_index);
		if (child === BB_INVALID) {
			return;
		}
		this._bb_pool.write_ui16(child, field, v);
	}

	/**
	 * @param {number} entity_index
	 * @param {number} key_index
	 * @param {number} field
	 * @param {number} flag
	 * @returns {boolean}
	 */
	read_flag_slot(entity_index, key_index, field, flag) {
		const child = this.get_slot(entity_index, key_index);
		if (child === BB_INVALID) {
			return false;
		}
		return this._bb_pool.read_flag(child, field, flag);
	}

	/**
	 * @param {number} entity_index
	 * @param {number} key_index
	 * @param {number} field
	 * @param {number} flag
	 * @param {boolean} v
	 * @returns {void}
	 */
	write_flag_slot(entity_index, key_index, field, flag, v) {
		const child = this.ensure_slot(entity_index, key_index);
		if (child === BB_INVALID) {
			return;
		}
		this._bb_pool.write_flag(child, field, flag, v);
	}

	/**
	 * @param {number} chunk_index
	 * @param {number} field
	 * @returns {number}
	 */
	read_chunk(chunk_index, field) {
		if (chunk_index === BB_INVALID) {
			return 0;
		}
		return this._bb_pool.read_ui16(chunk_index, field);
	}

	/**
	 * @param {number} chunk_index
	 * @param {number} field
	 * @param {number} v
	 * @returns {void}
	 */
	write_chunk(chunk_index, field, v) {
		if (chunk_index === BB_INVALID) {
			return;
		}
		this._bb_pool.write_ui16(chunk_index, field, v);
	}

	/**
	 * @param {number} chunk_index
	 * @param {number} field
	 * @param {number} flag
	 * @returns {boolean}
	 */
	read_chunk_flag(chunk_index, field, flag) {
		if (chunk_index === BB_INVALID) {
			return false;
		}
		return this._bb_pool.read_flag(chunk_index, field, flag);
	}

	/**
	 * @param {number} chunk_index
	 * @param {number} field
	 * @param {number} flag
	 * @param {boolean} v
	 * @returns {void}
	 */
	write_chunk_flag(chunk_index, field, flag, v) {
		if (chunk_index === BB_INVALID) {
			return;
		}
		this._bb_pool.write_flag(chunk_index, field, flag, v);
	}

	/**
	 * @param {number} entity_index
	 * @returns {void}
	 */
	dispose_entity(entity_index) {
		// tbx-lifecycle step 6)
		if (!this._started) {
			return;
		}
		const entity = this._entity_pool;
		const root = entity.read_ui16(entity_index, this._var_entity_bb_root);
		if (root === BB_INVALID) {
			return;
		}
		const pool = this._bb_pool;
		// 2026-06-14, Composer: free module component chunks before table chunk [bbpl1]
		const mod_child = pool.read_ui16(root, BB_SLOT_BASE + BB_KEY_MODULE);
		if (mod_child !== BB_INVALID) {
			for (const flag of BB_MODULE_FLAGS) {
				const chunk_idx = pool.read_ui16(mod_child, VAR_MTBL_FLAGS + 1 + flag);
				if (chunk_idx !== BB_INVALID) {
					this.free_chunk(chunk_idx);
				}
			}
		}
		for (let k = 0; k < BB_MAX_KEYS; k++) {
			const child = pool.read_ui16(root, BB_SLOT_BASE + k);
			if (child !== BB_INVALID) {
				this.free_chunk(child);
			}
		}
		this.free_chunk(root);
		entity.write_ui16(entity_index, this._var_entity_bb_root, BB_INVALID);
	}
}

export default Blackboard;
export {
	BB_INVALID,
	BB_KEY_MODULE,
	VAR_MTBL_FLAGS,
	VAR_FLAG_INITIALIZED,
	VAR_FLAG_DISPOSED,
};
// 2026-06-14, Composer: blackboard merged chunk pool for modules [bbpl1]
