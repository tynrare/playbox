/** @namespace ty */
// 2026-06-14, Composer: lifespan module sets toy disposed at limit [lifsp1]
// 2026-06-14, Composer: playbox dt is sec booling dt is ms [lifsp2]
import { clamp } from "../math.js";
import Module from "./module.js";
import { VAR_FLAGS_A } from "../core/mempool.js";
import { VAR_FLAG_DISPOSED } from "../scene/blackboard.js";

const VAR_MODULE_LIFESPAN_MS_LIMIT = 3;
const VAR_MODULE_LIFESPAN_SEC_LIMIT = 4;
const VAR_MODULE_LIFESPAN_MS_ELAPSED = 5;
const VAR_MODULE_LIFESPAN_SEC_ELAPSED = 6;

/**
 * @class Lifespan
 * @memberof pb.toys
 */
class Lifespan extends Module {
	/**
	 * @param {number} module_flag
	 * @param {import("../core/mempool.js").default} toy_mempool
	 */
	constructor(module_flag, toy_mempool) {
		super(module_flag);
		this._toy_mempool = toy_mempool;
	}

	init_module(index, moduleindex) {
		this.write(index, VAR_MODULE_LIFESPAN_MS_LIMIT, 0);
		this.write(index, VAR_MODULE_LIFESPAN_SEC_LIMIT, 5);
		this.write(index, VAR_MODULE_LIFESPAN_MS_ELAPSED, 0);
		this.write(index, VAR_MODULE_LIFESPAN_SEC_ELAPSED, 0);
	}

	configure_module(index, conf) {
		this.set_limit(index, (conf.lifespan ?? 5) * 1000);
	}

	dispose_module(_index, _moduleindex) {}

	/**
	 * @param {number} index
	 * @param {number} ms
	 * @returns {void}
	 */
	set_limit(index, ms) {
		const _ms = ms % 1000;
		const s = Math.floor(ms / 1000);
		this.write(index, VAR_MODULE_LIFESPAN_MS_LIMIT, _ms);
		this.write(index, VAR_MODULE_LIFESPAN_SEC_LIMIT, s);
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	get_progress(index) {
		const mselapsed = this.read(index, VAR_MODULE_LIFESPAN_MS_ELAPSED);
		const selapsed = this.read(index, VAR_MODULE_LIFESPAN_SEC_ELAPSED);
		const elapsed = selapsed * 1000 + mselapsed;

		const mslimit = this.read(index, VAR_MODULE_LIFESPAN_MS_LIMIT);
		const slimit = this.read(index, VAR_MODULE_LIFESPAN_SEC_LIMIT);
		const limit = slimit * 1000 + mslimit;
		if (limit <= 0) {
			return 1;
		}
		return clamp(0, 1, elapsed / limit);
	}

	/**
	 * @param {number} dt seconds (playbox); booling passes ms
	 * @param {number} index
	 * @param {number} _moduleindex
	 * @returns {void}
	 */
	update(dt, index, _moduleindex) {
		if (this._toy_mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED)) {
			return;
		}

		// 2026-06-14, Composer: playbox dt is sec booling dt is ms [lifsp2]
		const dt_ms = dt * 1000;
		const elapsed = this.read(index, VAR_MODULE_LIFESPAN_MS_ELAPSED) + dt_ms;
		if (elapsed >= 1000) {
			const selapsed = this.read(index, VAR_MODULE_LIFESPAN_SEC_ELAPSED);
			this.write(index, VAR_MODULE_LIFESPAN_SEC_ELAPSED, selapsed + 1);
			this.write(index, VAR_MODULE_LIFESPAN_MS_ELAPSED, elapsed - 1000);
		} else {
			this.write(index, VAR_MODULE_LIFESPAN_MS_ELAPSED, elapsed);
		}

		if (this.get_progress(index) >= 1.0) {
			this._toy_mempool.write_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED, true);
		}
	}
}

export default Lifespan;
// 2026-06-14, Composer: lifespan module sets toy disposed at limit [lifsp1]
// 2026-06-14, Composer: playbox dt is sec booling dt is ms [lifsp2]
