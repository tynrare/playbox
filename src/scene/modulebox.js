/** @namespace ty */
// 2026-06-14, Composer: modulebox storage via blackboard merged pool [mdlbx1]
import logger from "../logger.js";
import Blackboard, {
	BB_INVALID,
	BB_KEY_MODULE,
	VAR_MTBL_FLAGS,
	VAR_FLAG_INITIALIZED,
	VAR_FLAG_DISPOSED,
} from "./blackboard.js";
import { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../core/mempool.js";
import Lifespan from "../toys/lifespan.js";

const VAR_FLAGS_MODULES = 5;
const VAR_MFLAG_LIFESPAN = 0;

const modulelist = [VAR_MFLAG_LIFESPAN];
const modulenames = {
	lifespan: VAR_MFLAG_LIFESPAN,
};

/**
 * @class Modulebox
 * @memberof pb.scene
 */
class Modulebox {
	static modulenames = modulenames;

	/**
	 * @param {Blackboard} blackboard
	 * @param {import("../core/mempool.js").default} toy_mempool
	 */
	constructor(blackboard, toy_mempool) {
		this._blackboard = blackboard;
		this._toy_mempool = toy_mempool;
		this.lifespan = new Lifespan(VAR_MFLAG_LIFESPAN, toy_mempool);
		/** @type {Array<import("../toys/module.js").default>} */
		this.modulelist = [this.lifespan];
	}

	/** @returns {void} */
	init() {
		// 2026-06-17, Composer: modulebox init defers lifespan init [mdlinit1]
		this.lifespan.init(this._blackboard);
	}

	/**
	 * @param {number} index
	 * @param {Record<string, any>} conf
	 * @returns {void}
	 */
	configure(index, conf) {
		for (const i in this.modulelist) {
			const module = this.modulelist[i];
			if (this._toy_mempool.read_flag(index, VAR_FLAGS_MODULES, module.module_flag)) {
				module.configure_module(index, conf);
			}
		}
	}

	/**
	 * @param {number} index
	 * @returns {void}
	 */
	init_modules(index) {
		// tbx-lifecycle step 3)
		this.update(0, index);
	}

	/**
	 * @param {number} dt
	 * @param {number} index
	 * @returns {void}
	 */
	update(dt, index) {
		// tbx-lifecycle step 4)
		this.update_table(index);
		for (let i = 0; i < modulelist.length; i++) {
			this.update_module(dt, index, i);
		}
	}

	/**
	 * @param {number} index
	 * @returns {void}
	 */
	update_table(index) {
		const active = this._toy_mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE);
		const disposed = this._toy_mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED);
		if (active && !disposed) {
			this._blackboard.ensure_slot(index, BB_KEY_MODULE);
			if (
				!this._blackboard.read_flag_slot(
					index,
					BB_KEY_MODULE,
					VAR_FLAGS_A,
					VAR_FLAG_ACTIVE,
				)
			) {
				this._blackboard.write_flag_slot(
					index,
					BB_KEY_MODULE,
					VAR_FLAGS_A,
					VAR_FLAG_ACTIVE,
					true,
				);
				this._blackboard.write_flag_slot(
					index,
					BB_KEY_MODULE,
					VAR_FLAGS_A,
					VAR_FLAG_INITIALIZED,
					false,
				);
				for (const flag of modulelist) {
					this._blackboard.write_flag_slot(
						index,
						BB_KEY_MODULE,
						VAR_MTBL_FLAGS,
						flag,
						false,
					);
				}
			}
		} else if (disposed) {
			if (this._blackboard.get_slot(index, BB_KEY_MODULE) !== BB_INVALID) {
				this._blackboard.write_flag_slot(
					index,
					BB_KEY_MODULE,
					VAR_FLAGS_A,
					VAR_FLAG_ACTIVE,
					false,
				);
				this._blackboard.write_flag_slot(
					index,
					BB_KEY_MODULE,
					VAR_FLAGS_A,
					VAR_FLAG_DISPOSED,
					false,
				);
			}
		}
	}

	/**
	 * @param {number} dt
	 * @param {number} index
	 * @param {number} modulei
	 * @returns {void}
	 */
	update_module(dt, index, modulei) {
		const moduleflag = modulelist[modulei];
		const modulevar = VAR_MTBL_FLAGS + 1 + moduleflag;

		const active = this._toy_mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE);
		const disposed = this._toy_mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED);

		const moduleset = this._toy_mempool.read_flag(
			index,
			VAR_FLAGS_MODULES,
			moduleflag,
		);
		const moduleactive = this._blackboard.read_flag_slot(
			index,
			BB_KEY_MODULE,
			VAR_MTBL_FLAGS,
			moduleflag,
		);
		let moduleindex = this._blackboard.read(index, BB_KEY_MODULE, modulevar);

		if (!moduleset && !moduleactive) {
			return;
		}
		if (disposed && !moduleactive) {
			return;
		}

		if (!moduleactive && !disposed && moduleset) {
			moduleindex = this._blackboard.spawn_chunk();
			if (moduleindex === BB_INVALID) {
				logger.error(
					`Modulebox::update_module entity #${index} module ${moduleflag} chunk spawn failed`,
				);
				return;
			}
			this._blackboard.write_flag_slot(
				index,
				BB_KEY_MODULE,
				VAR_MTBL_FLAGS,
				moduleflag,
				true,
			);
			this._blackboard.write(index, BB_KEY_MODULE, modulevar, moduleindex);
			this._blackboard.write_chunk_flag(
				moduleindex,
				VAR_FLAGS_A,
				VAR_FLAG_INITIALIZED,
				false,
			);
			this._blackboard.write_chunk_flag(
				moduleindex,
				VAR_FLAGS_A,
				VAR_FLAG_DISPOSED,
				false,
			);
		} else if (moduleactive && (disposed || !moduleset)) {
			this._blackboard.write_chunk_flag(
				moduleindex,
				VAR_FLAGS_A,
				VAR_FLAG_DISPOSED,
				true,
			);
			this._blackboard.write_flag_slot(
				index,
				BB_KEY_MODULE,
				VAR_MTBL_FLAGS,
				moduleflag,
				false,
			);
		}

		const memtable_active = this._blackboard.read_flag_slot(
			index,
			BB_KEY_MODULE,
			VAR_MTBL_FLAGS,
			moduleflag,
		);
		if (memtable_active || moduleactive) {
			moduleindex = this._blackboard.read(index, BB_KEY_MODULE, modulevar);
			const module = this.modulelist[modulei];
			if (
				!this._blackboard.read_chunk_flag(
					moduleindex,
					VAR_FLAGS_A,
					VAR_FLAG_INITIALIZED,
				)
			) {
				module.init_module(index, moduleindex);
				this._blackboard.write_chunk_flag(
					moduleindex,
					VAR_FLAGS_A,
					VAR_FLAG_INITIALIZED,
					true,
				);
			}

			module.update(dt, index, moduleindex);

			if (
				this._blackboard.read_chunk_flag(
					moduleindex,
					VAR_FLAGS_A,
					VAR_FLAG_DISPOSED,
				)
			) {
				module.dispose_module(index, moduleindex);
				this._blackboard.free_chunk(moduleindex);
				this._blackboard.write(index, BB_KEY_MODULE, modulevar, BB_INVALID);
			}
		}
	}
}

export default Modulebox;
export { VAR_FLAGS_MODULES, VAR_MFLAG_LIFESPAN, modulenames };
// 2026-06-14, Composer: modulebox storage via blackboard merged pool [mdlbx1]
// 2026-06-17, Composer: modulebox init defers lifespan init [mdlinit1]
