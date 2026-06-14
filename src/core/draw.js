/** @namespace ty */
// 2026-06-14, Composer: move draw into src/core [d4f6b0]
import * as THREE from "three";
import { N8AOPass } from "n8ao";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { HorizontalTiltShiftShader } from "three/addons/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/addons/shaders/VerticalTiltShiftShader.js";
import Drawcore from "../render/drawcore.js";

const BLOOM_FACTOR = 0.9;

// 2026-06-14, Composer: port RenderBoolingSandsphere into Draw [drwprt1]
/**
 * @class Draw
 * @memberof pb.core
 */
class Draw {
  /**
   * @param {import("./db.js").default} db
   * @param {import("./render.js").default} render
   * @param {import("./assets.js").default} assets
   */
  constructor(db, render, assets) {
    // 2026-06-14, Composer: port RenderBoolingSandsphere into Draw [drwprt1]
    this._db = db;
    this._render = render;
    this._assets = assets;
    this.active = false;
    this.scale = 1;
    this._width = 1;
    this._height = 1;

    /** @type {Drawcore|null} */
    this.core = null;
    /** @type {THREE.Object3D|null} */
    this.pivot = null;
    /** @type {THREE.Scene|null} */
    this.sceneui = null;
    /** @type {THREE.OrthographicCamera|null} */
    this.cameraui = null;
    /** @type {EffectComposer|null} */
    this.composer = null;
    /** @type {RenderPass|null} */
    this.scene_pass = null;
    /** @type {RenderPass|null} */
    this.ui_pass = null;
    /** @type {N8AOPass|null} */
    this.n8aopass = null;
    /** @type {ShaderPass|null} */
    this.tiltShiftPassH = null;
    /** @type {ShaderPass|null} */
    this.tiltShiftPassV = null;
    this._tiltShiftEnabled = false;
    this._tiltShiftDistance = 8;
    /** @type {UnrealBloomPass|null} */
    this._bloomPass = null;
  }

  /**
   * @returns {THREE.Scene|null}
   */
  get scene() {
    return this._render.scene;
  }

  /**
   * @returns {number}
   */
  get width() {
    return this._width * this.scale;
  }

  /**
   * @returns {number}
   */
  get height() {
    return this._height * this.scale;
  }

  /**
   * @returns {Draw}
   */
  init() {
    this.active = false;
    this.core = new Drawcore();
    return this;
  }

  /**
   * @returns {void}
   */
  dispose() {
    this.stop();
    this.core?.dispose();
    this.core = null;
  }

  /**
   * @returns {void}
   */
  start() {
    const render = this._render;
    if (!this.core || !render.renderer || !render.scene || !render.camera) {
      return;
    }

    this.active = true;

    render.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    render.renderer.toneMappingExposure = 0.7;

    this.pivot = new THREE.Object3D();
    render.scene.add(this.pivot);

    const hw = this.width * 0.5;
    const hh = this.height * 0.5;
    this.cameraui = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 40);
    this.cameraui.position.z = 20;
    this.sceneui = new THREE.Scene();
    this.sceneui.add(new THREE.AmbientLight(0xffffff, 1));

    this.core.setRenderer(render.renderer);
    this.core.init();
    this.pivot.add(this.core.pivot);

    const composer = new EffectComposer(render.renderer);
    const renderPass1 = new RenderPass(render.scene, render.camera);
    const renderPass2 = new RenderPass(this.sceneui, this.cameraui);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width * 0.5, this.height * 0.5),
      0.02,
      0.02,
      BLOOM_FACTOR,
    );
    const outputPass = new OutputPass();

    const n8aopass = new N8AOPass(
      render.scene,
      render.camera,
      this.width * 0.25,
      this.height * 0.25,
    );
    n8aopass.configuration.gammaCorrection = false;
    n8aopass.configuration.intensity = 2.0;
    n8aopass.configuration.colorMultiply = false;
    n8aopass.configuration.halfRes = true;
    n8aopass.configuration.depthAwareUpsampling = false;
    n8aopass.configuration.aoSamples = 8;
    n8aopass.configuration.denoiseSamples = 4;
    n8aopass.configuration.denoiseRadius = 16;
    n8aopass.configuration.aoTones = 0;
    n8aopass.configuration.autoRenderBeauty = true;
    n8aopass.enabled = false;

    const tiltShiftPassH = new ShaderPass(HorizontalTiltShiftShader);
    const tiltShiftPassV = new ShaderPass(VerticalTiltShiftShader);
    tiltShiftPassH.enabled = false;
    tiltShiftPassV.enabled = false;
    tiltShiftPassH.uniforms.h.value = 1 / Math.max(1, this.width);
    tiltShiftPassV.uniforms.v.value = 1 / Math.max(1, this.height);
    tiltShiftPassH.uniforms.r.value = 0.5;
    tiltShiftPassV.uniforms.r.value = 0.5;

    composer.renderToScreen = true;
    composer.setPixelRatio(render.renderer.getPixelRatio());
    renderPass2.clear = false;
    renderPass2.clearDepth = true;

    composer.addPass(renderPass1);
    composer.addPass(n8aopass);
    composer.addPass(tiltShiftPassH);
    composer.addPass(tiltShiftPassV);
    composer.addPass(renderPass2);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    this.composer = composer;
    this.scene_pass = renderPass1;
    this.ui_pass = renderPass2;
    this._bloomPass = bloomPass;
    this.n8aopass = n8aopass;
    this.tiltShiftPassH = tiltShiftPassH;
    this.tiltShiftPassV = tiltShiftPassV;

    this.equalizer();
  }

  /**
   * @returns {void}
   */
  stop() {
    this.active = false;

    this.pivot?.clear();
    this.pivot?.removeFromParent();
    this.pivot = null;

    this.cameraui = null;
    this.sceneui = null;

    this.composer?.dispose();
    this.composer = null;
    this._bloomPass = null;
    this.n8aopass = null;
    this.tiltShiftPassH = null;
    this.tiltShiftPassV = null;
    this.scene_pass = null;
    this.ui_pass = null;
  }

  /**
   * @returns {void}
   */
  equalizer() {
    const rw = document.body.clientWidth;
    const rh = document.body.clientHeight;
    const render = this._render;

    if (rw != this._width || rh != this._height) {
      this._width = rw;
      this._height = rh;

      if (render.renderer && render.camera) {
        render.renderer.setSize(this.width, this.height);
        render.camera.aspect = this.width / this.height;
        render.camera.updateProjectionMatrix();
      }

      // 2026-06-14, Composer: cameraui resize in equalizer [drweq1]
      const hw = this.width * 0.5;
      const hh = this.height * 0.5;
      if (this.cameraui) {
        this.cameraui.left = -hw;
        this.cameraui.right = hw;
        this.cameraui.top = hh;
        this.cameraui.bottom = -hh;
        this.cameraui.updateProjectionMatrix();
      }

      this.composer?.setSize(this.width, this.height);
      this._bloomPass?.setSize(hw, hh);
      if (this.tiltShiftPassH?.uniforms?.h) {
        this.tiltShiftPassH.uniforms.h.value = 1 / Math.max(1, this.width);
      }
      if (this.tiltShiftPassV?.uniforms?.v) {
        this.tiltShiftPassV.uniforms.v.value = 1 / Math.max(1, this.height);
      }
    }
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt) {
    if (!this.active || !this.composer) {
      return;
    }

    this.equalizer();

    if (this.ui_pass && this.scene_pass) {
      this.ui_pass.clear = !this.scene_pass.enabled;
    }

    if (
      this._tiltShiftEnabled &&
      this.tiltShiftPassH?.uniforms?.h &&
      this.tiltShiftPassV?.uniforms?.v &&
      this.tiltShiftPassH?.uniforms?.r &&
      this.tiltShiftPassV?.uniforms?.r
    ) {
      const blur_factor = Math.min(1, Math.max(0, (this._tiltShiftDistance - 6) / 20));
      this.tiltShiftPassH.uniforms.r.value = 0.5;
      this.tiltShiftPassV.uniforms.r.value = 0.5;
      this.tiltShiftPassH.uniforms.h.value =
        (1 / Math.max(1, this.width)) * (1 + blur_factor * 1.5);
      this.tiltShiftPassV.uniforms.v.value =
        (1 / Math.max(1, this.height)) * (1 + blur_factor * 1.5);
    }

    this.composer.render(dt);
  }

  /**
   * @param {THREE.Object3D} child
   * @returns {void}
   */
  add(child) {
    this.pivot?.add(child);
  }

  /**
   * @param {THREE.Object3D} child
   * @returns {void}
   */
  remove(child) {
    this.pivot?.remove(child);
  }

  /**
   * @param {boolean} enabled
   * @returns {void}
   */
  set_ultra_ao_enabled(enabled) {
    if (!this.n8aopass) {
      return;
    }
    this.n8aopass.enabled = !!enabled;
  }

  /**
   * @param {boolean} enabled
   * @returns {void}
   */
  set_ultra_tiltshift_enabled(enabled) {
    this._tiltShiftEnabled = !!enabled;
    if (this.tiltShiftPassH) {
      this.tiltShiftPassH.enabled = this._tiltShiftEnabled;
    }
    if (this.tiltShiftPassV) {
      this.tiltShiftPassV.enabled = this._tiltShiftEnabled;
    }
  }

  /**
   * @param {number} distance
   * @returns {void}
   */
  set_tiltshift_distance(distance) {
    this._tiltShiftDistance = Math.max(0, Number(distance) || 0);
  }
}

export default Draw;
// 2026-06-14, Composer: cameraui resize in equalizer [drweq1]
// 2026-06-14, Composer: port RenderBoolingSandsphere into Draw [drwprt1]
