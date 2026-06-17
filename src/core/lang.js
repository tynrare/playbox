/** @namespace ty */
// 2026-06-14, Composer: cache db lang strings by locale key [lng1]
// 2026-06-17, Composer: lang dispose unwinds init [lngdsp1]
import logger from "../logger.js";

/**
 * @class Lang
 * @memberof pb.core
 */
class Lang {
  /**
   * @param {import("./db.js").default} db
   * @param {string} [locale="en"]
   */
  constructor(db, locale = "en") {
    this._db = db;
    this._locale = locale;
    /** @type {Map<string, string>} */
    this._cache = new Map();
  }

  /**
   * @param {string} [locale]
   * @returns {void}
   */
  init(locale) {
    if (locale) {
      this._locale = locale;
    }

    this._cache.clear();
    const entry = this._db.get("lang");
    if (!entry) {
      logger.warn("Lang::init lang db not found");
      return;
    }

    for (const key of entry.getkeys()) {
      const conf = entry.getconfig(key);
      if (!conf) {
        continue;
      }
      const value = conf[this._locale] ?? conf.en ?? key;
      this._cache.set(key, `${value}`);
    }

    logger.log(`Lang::init locale "${this._locale}", ${this._cache.size} entries`);
  }

  /**
   * @param {string} key
   * @returns {string}
   */
  get(key) {
    return this._cache.get(key) ?? key;
  }

  /**
   * @returns {void}
   */
  stop() {
    this._cache.clear();
  }

  /**
   * @returns {void}
   */
  dispose() {
    // 2026-06-17, Composer: lang dispose unwinds init [lngdsp1]
    this.stop();
  }
}

export default Lang;
// 2026-06-14, Composer: cache db lang strings by locale key [lng1]
// 2026-06-17, Composer: lang dispose unwinds init [lngdsp1]
