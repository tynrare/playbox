/** @namespace ty */
import * as THREE from "three";
import logger from "../logger.js";
import { TyntextCore } from "./tyntext.js";

// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
/**
 * @class Scene
 * @memberof pb.core
 */
class Scene {
  /**
   * @param {import("./draw.js").default} draw
   * @param {import("./db.js").default} db
   * @param {import("./assets.js").default} assets
   */
  constructor(draw, db, assets) {
    this._draw = draw;
    this._db = db;
    this._assets = assets;
    this.tyntext = new TyntextCore(draw, db, assets);
  }

  /**
   * @param {string} fontkey
   * @param {boolean} [ui]
   * @returns {import("./tyntext.js").Tyntext|null}
   */
  text(fontkey, ui = true) {
    return this.tyntext.maketext(fontkey, ui);
  }

  /**
   * @param {string} name
   * @returns {{ key: string, entity: import("@three.ez/instanced-mesh").InstancedEntity }|null}
   */
  model(name) {
    const conf = this._db.get("models")?.getconfig(name);
    if (!conf) {
      logger.error(`Scene::model config not found: ${name}`);
      return null;
    }

    const template_name = conf["instanceof"];
    if (!template_name) {
      logger.error(`Scene::model missing instanceof for ${name}`);
      return null;
    }

    const tpl = this._db.get("models_instanced")?.getconfig(template_name);
    if (!tpl) {
      logger.error(`Scene::model instanced template not found: ${template_name}`);
      return null;
    }

    const type = tpl["type"];
    if (type !== "box") {
      logger.error(`Scene::model unsupported type: ${type}`);
      return null;
    }

    const texture_name = conf["texture"];
    const map = this._assets.file(texture_name);
    if (!map) {
      logger.error(`Scene::model texture not found: ${texture_name}`);
      return null;
    }

    const core = this._draw.core;
    if (!core) {
      logger.error(`Scene::model drawcore not ready`);
      return null;
    }

    const w = tpl["w"] ?? 1;
    const h = tpl["h"] ?? 1;
    const d = tpl["d"] ?? 1;
    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = new THREE.MeshStandardMaterial({ map });

    if (!core.getimesh(template_name)) {
      core.initimesh(template_name, geometry, material, {
        capacity: 8,
        renderer: this._draw._render.renderer,
        castShadow: true,
        receiveShadow: false,
      });
    }

    const entity = core.makemesh(template_name);
    if (!entity) {
      return null;
    }

    return { key: template_name, entity };
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt) {
    this.tyntext.step(dt);
  }
}

export default Scene;
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
