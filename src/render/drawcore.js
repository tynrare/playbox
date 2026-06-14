import Drawlines from "./drawlines.js";
import * as THREE from "three";
import { InstancedMesh2 } from "@three.ez/instanced-mesh";
import logger from "../logger.js";

// 2026-06-14, Composer: fix drawcore imports drop gltf [t3dc1]
class Drawcore {
  constructor() {
    this.drawlines = new Drawlines({
      color: 0x999999,
      linewidth: 2,
    });
    /** @type {Object<string, InstancedMesh2>} */
    this.imeshes = {};
    /** @type {THREE.WebGLRenderer|null} */
    this._renderer = null;
    this.pivot = null;
  }

  /**
   * @brief Bind WebGL renderer so InstancedMesh2 can init uint instanceIndex at create.
   * @param {THREE.WebGLRenderer} renderer
   * @returns {void}
   */
  setRenderer(renderer) {
    this._renderer = renderer;
  }

  init() {
    this.pivot = new THREE.Object3D();
    this.drawlines.init();
    this.pivot.add(this.drawlines.pivot);
  }

  dispose() {
    this.pivot.clear();
    this.pivot.removeFromParent();
    this.drawlines.dispose();
    for (const k in this.imeshes) {
      this.delimesh(k);
    }
  }

  /**
   * @param {string} key
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Material} material
   * @param {object} [opts]
   * @param {boolean} [opts.bvh=false]
   * @param {boolean} [opts.culling=true]
   * @param {number} [opts.capacity=100]
   * @param {boolean} [opts.castShadow=true]
   * @param {boolean} [opts.receiveShadow=false]
   * @param {THREE.WebGLRenderer} [opts.renderer]
   */
  initimesh(
    key,
    geometry,
    material,
    opts = {
      bvh: false,
      culling: true,
      capacity: 100,
      castShadow: true,
      receiveShadow: false,
    },
    pivot,
  ) {
    if (this.imeshes[key]) {
      logger.devwarn(
        `Drawcore::initimesh error. InstancedMesh "${key}" already exists.`,
      );

      return this.imeshes[key];
    }

    const renderer = opts?.renderer ?? this._renderer ?? null;
    const imesh = new InstancedMesh2(geometry, material, {
      createEntities: true,
      capacity: opts?.capacity ?? 100,
      ...(renderer ? { renderer } : {}),
    });

    imesh.castShadow = opts?.castShadow ?? true;
    imesh.receiveShadow = opts?.receiveShadow ?? false;
    this.imeshes[key] = imesh;
    if (opts?.bvh) {
      imesh.computeBVH({ margin: 0 });
    }
    imesh.autoUpdateBVH = opts?.bvh;

    imesh.perObjectFrustumCulled = opts?.culling ?? true;
    (pivot ?? this.pivot).add(imesh);

    imesh.key = key;
    logger.devlog(`Drawcore::initimesh. Mesh "${key}" initialized.`);

    return imesh;
  }

  delimesh(key, fullclear = false) {
    const imesh = this.imeshes[key];
    if (!imesh) {
      return;
    }
    if (fullclear) {
      imesh.material.dispose();
      imesh.geometry.dispose();
    }
    imesh.clearInstances();
    imesh.removeFromParent();
    delete this.imeshes[key];
  }

  inituniforms(key, fragment, vertex) {
    const imesh = this.imeshes[key];
    if (!imesh) {
      logger.error(
        `Drawcore::inituniforms error. No "${key}" InstancedMesh was created.`,
      );

      return null;
    }

    imesh.initUniformsPerInstance({ fragment, vertex });
  }

  /**
   * @param {string} key
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  makemesh(key) {
    const imesh = this.imeshes[key];
    if (!imesh) {
      logger.error(
        `Drawcore::makemesh error. No "${key}" InstancedMesh was created.`,
      );

      return null;
    }

    let instanceindex = -1;
    imesh.addInstances(1, (obj, index) => {
      instanceindex = index;
    });

    return imesh.instances[instanceindex];
  }

  /**
   * @param {string} key
   * @param {number} count
   * @param {function(import("@three.ez/instanced-mesh").InstancedEntity, number): void} callback
   */
  makemeshes(key, count, callback) {
    const imesh = this.imeshes[key];
    if (!imesh) {
      logger.error(
        `Drawcore::makemeshes error. No "${key}" InstancedMesh was created.`,
      );

      return null;
    }

    imesh.addInstances(count, callback);
  }

  /**
   * @param {string} key
   * @param {number} index
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  getinstance(key, index) {
    const imesh = this.imeshes[key];
    if (!imesh) {
      logger.error(
        `Drawcore::getinstance error. No "${key}" InstancedMesh was created.`,
      );

      return null;
    }

    return imesh.instances[index];
  }

  /**
   * @param {string} key
   * @returns {InstancedMesh2|null}
   */
  getimesh(key) {
    return this.imeshes[key] ?? null;
  }
}

export default Drawcore;
// 2026-06-14, Composer: fix drawcore imports drop gltf [t3dc1]
// 2026-05-25, Composer: pass renderer for early instanceIndex UINT bind [dcim1]
