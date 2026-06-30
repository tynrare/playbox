// Purpose: minimal Howler audiosprite for playbox (res/sound/sound.json).

import { Howl } from "howler";
import logger from "../logger.js";

const SOUND_JSON_URL = "./sound/sound.json";

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp_volume(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

const HOWLER_VOL_MAX = 0.25;
const HOWLER_VOL_EXP = 2;

/**
 * @param {number} linear01 logical volume 0..1
 * @returns {number}
 */
// 2026-06-30, Composer: perceptual curve for howler amplitude [pbxau4]
function toHowlerVolume(linear01) {
	const t = clamp_volume(linear01, 0, 1);
	return HOWLER_VOL_MAX * Math.pow(t, HOWLER_VOL_EXP);
}

/**
 * @brief Minimal Howler wrapper; loads audiosprite JSON directly (no assets db).
 */
class Audio {
	constructor() {
		/** @type {Howl | null} */
		this.howl = null;
		/** @type {boolean} */
		this._enabled = true;
	}

	/**
	 * @brief Enable or mute audiosprite playback.
	 * @param {boolean} on
	 * @returns {void}
	 */
	// 2026-06-27, Composer: settings sound toggle mutes howler [pbxau2]
	set_enabled(on) {
		this._enabled = on;
		this.howl?.mute(!on);
	}

	/**
	 * @brief Fetch sound.json and create the Howl sprite.
	 * @returns {void}
	 */
	// 2026-06-27, Composer: fetch audiosprite json for playbox scene [pbxau1]
	run() {
		fetch(SOUND_JSON_URL)
			.then((res) => {
				if (!res.ok) {
					throw new Error(`${res.status} ${res.statusText}`);
				}
				return res.json();
			})
			.then((data) => {
				this.howl = new Howl({
					src: data.src,
					sprite: data.sprite,
				});
				this.howl.mute(!this._enabled);
			})
			.catch((err) => {
				logger.warn(
					`Audio::run failed to load ${SOUND_JSON_URL}: ${err.message ?? err}`,
				);
			});
	}

	/**
	 * @brief Play a named sprite from the loaded audiosprite.
	 * @param {string} name sprite key from sound.json
	 * @param {number} [volume=1] logical volume 0..1 (mapped perceptually for Howler)
	 * @returns {number | null} howler play id
	 */
	// 2026-06-27, Composer: per-instance howler volume on play [pbxau3]
	play(name, volume = 1) {
		if (!this._enabled || !this.howl) {
			return null;
		}
		const id = this.howl.play(name);
		if (id ?? false) {
			this.howl.volume(toHowlerVolume(volume), id);
		}
		return id;
	}

	/**
	 * @brief Random variant play: prefix_001 .. prefix_NNN.
	 * @param {string} prefix sprite name prefix
	 * @param {number} count variant count (1-based index, zero-padded width 3)
	 * @returns {number | null} howler play id
	 */
	rplay(prefix, count) {
		if (!this._enabled || !this.howl || count < 1) {
			return null;
		}
		const variant = 1 + ((Math.random() * count) | 0);
		const name = `${prefix}_${String(variant).padStart(3, "0")}`;
		return this.howl.play(name);
	}

	/**
	 * @brief Unload Howler instance.
	 * @returns {void}
	 */
	stop() {
		this.howl?.unload();
		this.howl = null;
	}
}

export default Audio;
export { Audio };

// 2026-06-27, Composer: fetch audiosprite json for playbox scene [pbxau1]
// 2026-06-27, Composer: settings sound toggle mutes howler [pbxau2]
// 2026-06-27, Composer: per-instance howler volume on play [pbxau3]
// 2026-06-30, Composer: perceptual curve for howler amplitude [pbxau4]
