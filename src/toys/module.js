/** @namespace ty */
// 2026-06-14, Composer: base module via blackboard chunks [modbs1]
import Blackboard, { BB_KEY_MODULE, VAR_MTBL_FLAGS } from "../scene/blackboard.js";

/**
 * @class Module
 * @memberof pb.toys
 */
class Module {
	/**
	 * @param {number} module_flag
	 */
	constructor(module_flag) {
		this.module_flag = module_flag;
		/** @type {Blackboard|null} */
		this._blackboard = null;
	}

	/**
	 * @param {Blackboard} blackboard
	 * @returns {Module}
	 */
	init(blackboard) {
		this._blackboard = blackboard;
		return this;
	}

	/**
	 * @param {number} index
	 * @returns {boolean}
	 */
	has(index) {
		return this._blackboard.read_flag_slot(
			index,
			BB_KEY_MODULE,
			VAR_MTBL_FLAGS,
			this.module_flag,
		);
	}

	/**
	 * @param {number} index
	 * @returns {number|null}
	 */
	_moduleindex(index) {
		if (!this.has(index)) {
			return null;
		}
		const modulevar = VAR_MTBL_FLAGS + 1 + this.module_flag;
		return this._blackboard.read(index, BB_KEY_MODULE, modulevar);
	}

	/**
	 * @param {number} index
	 * @param {number} field
	 * @returns {number}
	 */
	read(index, field) {
		const moduleindex = this._moduleindex(index);
		if (moduleindex == null) {
			return 0;
		}
		return this._blackboard.read_chunk(moduleindex, field);
	}

	/**
	 * @param {number} index
	 * @param {number} field
	 * @param {number} v
	 * @returns {void}
	 */
	write(index, field, v) {
		const moduleindex = this._moduleindex(index);
		if (moduleindex == null) {
			return;
		}
		this._blackboard.write_chunk(moduleindex, field, v);
	}

	init_module(_index, _moduleindex) {}

	configure_module(_index, _conf) {}

	dispose_module(_index, _moduleindex) {}

	/**
	 * @param {number} _dt
	 * @param {number} _index
	 * @param {number} _moduleindex
	 * @returns {void}
	 */
	update(_dt, _index, _moduleindex) {}
}

export default Module;
// 2026-06-14, Composer: base module via blackboard chunks [modbs1]
