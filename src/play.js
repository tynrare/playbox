/** @namespace ty */
// 2026-06-14, Composer: import core from src/core [g7c9e3]
import Core from "./core/core.js";

// 2026-06-14, Composer: one instanced box via draw.model [t3pl1]
/**
 * @class Play
 * @memberof pb.play
 */
class Play {
  /**
   * @param {Core} core
   */
  constructor(core) {
    this._core = core;
    this._orbit_time = 0;
    this._orbit_radius = 2.75;
    this._orbit_height = 1.35;
    this._orbit_speed = 0.8;
  }

  /**
   * @returns {Play}
   */
  init() {
    return this;
  }

  /**
   * @returns {void}
   */
  start() {
    this.box = this._core.scene.model("box_timber");
    if (this.box?.entity) {
      this.box.entity.position.set(0, 0, -1.25);
    }

    // 2026-06-14, Composer: weld 3D and UI test text labels [txtwld1]
    this.label3d = this._core.scene.text("afont", false);
    if (this.label3d) {
      this.label3d.text = "on box";
      this.label3d.fontsize = 0.12;
      this.label3d.position.set(0, 0.65, -1.25);
      this.label3d.anchor.set(0.5, 0.5);
      this.label3d.update();
    }

    this.labelUi = this._core.scene.text("afont", true);
    if (this.labelUi) {
      this.labelUi.text = "UI CENTER";
      this.labelUi.fontsize = 28;
      this.labelUi.position.set(0, 0, 0);
      this.labelUi.anchor.set(0.5, 0.5);
      this.labelUi.update();
    }
  }

  /**
   * @returns {void}
   */
  stop() {
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt) {
    this._update_camera_orbit(dt);
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  _update_camera_orbit(dt) {
    const camera = this._core?.render?.camera;
    if (!camera) {
      return;
    }

    this._orbit_time += dt * this._orbit_speed;
    const x = Math.cos(this._orbit_time) * this._orbit_radius;
    const z = Math.sin(this._orbit_time) * this._orbit_radius;
    camera.position.set(x, this._orbit_height, z);
    camera.lookAt(0, 0, 0);
  }
}

export default Play;
// 2026-06-14, Composer: weld 3D and UI test text labels [txtwld1]
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
// 2026-06-14, Composer: one instanced box via draw.model [t3pl1]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: import core from src/core [g7c9e3]
