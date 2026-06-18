/** @namespace ty */
// 2026-06-18, Composer: booling loop lerp dt step dt rdt [loop1]
import logger from "../logger.js";
import { lerp } from "../math.js";

const TS = 1;
const FRAMELIMIT_MS = 16;

/**
 * @class Loop
 * @memberof pb.core
 */
class Loop {
	/**
	 * @param {(dt: number, rdt: number) => void} [cstep]
	 * @param {number} [_ts]
	 */
	constructor(cstep, _ts = TS) {
		this.active = false;
		this.paused = true;
		this.timestamp = -1;
		this.framelimit = FRAMELIMIT_MS / _ts;
		/** @type {((dt: number, rdt: number) => void)|null} */
		this.step = cstep ?? null;
		/** @type {((err: Error) => void)|null} */
		this.onerror = null;
		this.maxdt = Infinity;
		// 2026-06-18, Composer: booling loop lerp dt step dt rdt [loop1]
		this.ldt = 100 / _ts;
		this.dt = 0;
		this.timescale = 1;
		/** @type {((time: DOMHighResTimeStamp) => void)|null} */
		this._tloop = null;
	}

	/** @returns {void} */
	start() {
		this.paused = false;
		logger.log("Loop started");
	}

	/** @returns {void} */
	pause() {
		this.paused = true;
		logger.log("Loop paused");
	}

	/**
	 * @returns {this}
	 */
	run() {
		this.active = true;
		this.timestamp = performance.now();
		this._tloop = this.loop.bind(this);
		this.loop();
		this.start();
		return this;
	}

	/** @returns {void} */
	stop() {
		this.pause();
		this.active = false;
		this._tloop = null;
		logger.log("Loop stopped");
	}

	/** @returns {void} */
	loop() {
		if (!this.active || !this._tloop) {
			return;
		}

		try {
			const now = performance.now();
			const frame_dt = now - this.timestamp;
			if (frame_dt < this.framelimit) {
				requestAnimationFrame(this._tloop);
				return;
			}

			const cdt = Math.min(this.maxdt, frame_dt);
			this.dt = cdt;
			this.ldt = lerp(this.ldt, this.dt, 1e-1);
			this.timestamp = now;

			if (!this.paused && this.step) {
				const rdt = cdt * 1e-3;
				const dt = this.ldt * this.timescale * 1e-3;
				this.step(dt, rdt);
			}

			requestAnimationFrame(this._tloop);
		} catch (err) {
			this.active = false;
			this.paused = true;
			logger.error("Loop::step error - ", err);
			this.onerror?.(err);
		}
	}
}

export default Loop;
// 2026-06-18, Composer: booling loop lerp dt step dt rdt [loop1]
