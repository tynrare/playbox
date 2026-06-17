/** @namespace ty */

// 2026-06-14, Composer: move assets into src/core [b2d4f8]
import * as THREE from "three";
import Loader from "./loader.js";
import logger from "../logger.js";

// 2026-06-14, Composer: cache THREE.Texture at preload, drop three_texture [t3cch1]
/**
 * @class Assets
 * @memberof pb.core
 */
class Assets {
  /**
   * @param {import("./db.js").default} db
   * @param {import("./render.js").default} render
   */
  constructor(db, render) {
    this._db = db;
    this._render = render;
    /** @type {Map<string, any>} */
    this.filecache = new Map();
  }

  /**
   * @returns {Assets}
   */
  init() {
    return this;
  }

  /**
   * @returns {Assets}
   */
  dispose() {
    this._dispose_textures();
    return this;
  }

  /**
   * @returns {Assets}
   */
  start() {
    return this;
  }

  /**
   * @returns {Assets}
   */
  stop() {
    return this;
  }

  /**
   * @returns {void}
   */
  _dispose_textures() {
    // 2026-06-14, Composer: cache THREE.Texture at preload, drop three_texture [t3cch1]
    for (const value of this.filecache.values()) {
      if (value?.isTexture) {
        value.dispose();
      }
    }
    this.filecache.clear();
  }

  /**
   * @param {number} level
   * @param {(loaded: number, total: number) => void} [onProgress]
   * @returns {Promise<void>}
   */
  async preload(level, onProgress) {
    logger.log(`Assets::preload l${level}.`);
    const files = this._db.get("files");
    const filelist = files.getkeys();
    const jobs = [];
    const names = [];
    for (const file of filelist) {
      const conf = files.getconfig(file);
      const file_level = conf["preload"] ?? 999;
      if (file_level > level || this.filecache.has(file)) {
        continue;
      }
      jobs.push(conf);
      names.push(conf["name"]);
    }

    const total = jobs.length;
    let loaded = 0;
    // 2026-06-17, Composer: preload per-file progress callback [ldprg1]
    onProgress?.(loaded, total);

    await Promise.all(
      jobs.map(async (conf) => {
        await this.load_file(conf);
        loaded++;
        onProgress?.(loaded, total);
      }),
    );

    const wasntload = [];
    for (const i in names) {
      const n = names[i];
      if (!this.filecache.has(n)) {
        wasntload.push(n);
      }
    }

    if (wasntload.length) {
      logger.error(`Assets:: preload failed for: ${wasntload.toString()}`);
    }

    logger.log(`Assets::preload l${level} done.`);
  }

  /**
   * @param {Object} conf
   * @param {string} conf.path
   * @param {string} conf.name
   * @returns {Promise<any|null>}
   */
  async load_file(conf) {
    const path = conf["path"];
    if (path.endsWith(".json")) {
      return await this.load_file_json(conf);
    }
    return await this.load_file_texture(conf);
  }

  /**
   * @param {Object} conf
   * @param {string} conf.name
   * @param {string} conf.path
   * @returns {Promise<THREE.Texture|null>}
   */
  async load_file_texture(conf) {
    const name = conf["name"];
    const path = conf["path"];
    const image = await Loader.instance.image(`${path}`);
    if (image) {
      // 2026-06-14, Composer: cache THREE.Texture at preload, drop three_texture [t3cch1]
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      this.filecache.set(name, texture);
      return texture;
    }

    logger.error(`Assets::load_file_texture error loading ${path}`);
    return null;
  }

  /**
   * @param {Object} conf
   * @param {string} conf.name
   * @param {string} conf.path
   * @returns {Promise<Object|null>}
   */
  async load_file_json(conf) {
    const name = conf["name"];
    const path = conf["path"];
    const text = await Loader.instance.text(`${path}`);
    if (!text) {
      logger.error(`Assets::load_file_json error loading ${path}`);
      return null;
    }

    try {
      const data = JSON.parse(text);
      this.filecache.set(name, data);
      return data;
    } catch (err) {
      logger.error(`Assets::load_file_json parse error ${path}: ${err}`);
      return null;
    }
  }

  /**
   * @param {string} name
   * @returns {any|null}
   */
  file(name) {
    return this.filecache.get(name) ?? null;
  }

}

export default Assets;
// 2026-06-14, Composer: stop is no-op, dispose clears texture cache [asscyc1]
// 2026-06-14, Composer: cache THREE.Texture at preload, drop three_texture [t3cch1]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: move assets into src/core [b2d4f8]
// 2026-06-17, Composer: preload per-file progress callback [ldprg1]
