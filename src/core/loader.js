/** @namespace ty */

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import logger from "../logger.js";

// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-26, Composer: GLTFLoader cache and get_gltf [ldglt1]
/**
 * @class Loader
 * @memberof pb.core
 */
class Loader {
  static _instance;

  constructor() {
    /** @type {Record<string, object>} */
    this.gltfs = {};
    /** @type {Record<string, Promise<object>|null>} */
    this.loading_gltfs = {};
    this._gltf_loader = new GLTFLoader();
  }

  /**
   * @returns {Loader} .
   */
  static get instance() {
    if (!Loader._instance) {
      Loader._instance = new Loader();
    }

    return Loader._instance;
  }

  image(path) {
    console.log(`Loader::image loading ${path}`);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { resolve(image) };
      image.onerror = (event) => {
        const is_critical_error =
          event?.type !== "abort" &&
          (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0);
        resolve(is_critical_error ? null : image);
      };
      image.src = path;
    });
  }

  text(path) {
    return fetch(path)
      .then((response) => {
        if (!response.ok) {
          return null;
        }
        return response.text();
      })
      .catch(() => null);
  }

  /**
   * @param {string} url
   * @returns {Promise<object>}
   */
  get_gltf(url) {
    // 2026-06-26, Composer: GLTFLoader cache and get_gltf [ldglt1]
    const promise = (this.loading_gltfs[url] =
      this.loading_gltfs[url] ??
      new Promise((resolve, reject) => {
        if (this.gltfs[url]) {
          logger.log(`Loader::get_gltf gltf ${url} fetched from cache..`);
          this.loading_gltfs[url] = null;
          resolve(this.gltfs[url]);
          return;
        }

        logger.log(`Loader::get_gltf gltf ${url} loading..`);
        this._gltf_loader.load(
          url,
          (gltf) => {
            logger.log(`Loader::get_gltf gltf ${url} loaded.`);
            this.gltfs[url] = gltf;
            this._prepare_gltf(gltf);
            this.loading_gltfs[url] = null;
            resolve(gltf);
          },
          undefined,
          (error) => {
            this.loading_gltfs[url] = null;
            logger.error(`Loader::get_gltf loading "${url}" gltf error: `, error);
            reject(error);
          },
        );
      }));

    return promise;
  }

  /**
   * @param {import("three/addons/loaders/GLTFLoader.js").GLTF} gltf
   * @returns {void}
   */
  _prepare_gltf(gltf) {
    gltf.scene.traverse((o) => {
      /** @type {THREE.Mesh} */
      const mesh = /** @type {any} */ (o);
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = true;
    });
  }
}

export default Loader;
// 2026-06-26, Composer: GLTFLoader cache and get_gltf [ldglt1]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
