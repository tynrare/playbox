/** @namespace ty */
// 2026-06-14, Composer: import core from src/core [g7c9e3]
import Core from "./core/core.js";
import Settings from "./play/settings.js";

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
    /** @type {number|null} */
    this._ui_click_id = null;
    // 2026-06-14, Composer: settings dev_debug_state persistence [stgs1]
    this.settings = new Settings(core.datawork);
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
    // 2026-06-14, Composer: floor tex0 via environment floorstyle [plflr1]
    this._core.scene.environment.floorstyle("floor", 0xffffff);

    // 2026-06-14, Composer: floor collision via mesh-less floor_toy [flty1]
    this.floor = this._core.toybox.spawn("floor_toy");
    if (this.floor) {
      this.floor.setPosition(0, -0.05, 0);
    }

    // 2026-06-14, Composer: spawn box_test_toy via toybox [pltoy1]
    this.toy = this._core.toybox.spawn("box_test_toy");
    if (this.toy) {
      this.toy.setPosition(0, 2, -1.25);
    }

    // 2026-06-14, Composer: weld 3D and UI test text labels [txtwld1]
    this.label3d = this._core.scene.text("afont", false);
    if (this.label3d) {
      this.label3d.text = "on box";
      this.label3d.fontsize = 0.12;
      this.label3d.anchor.set(0.5, 0.5);
      this.label3d.update();
    }

    // 2026-06-14, Composer: 3D billboard pingtag sprite above box [sprtst1]
    this.ping = this._core.scene.makesprite("pingtag", false);
    if (this.ping) {
      this.ping.updateMatrix();
    }

    this._sync_toy_decor();

    // 2026-06-14, Composer: ui_dev state shows dev panel elements [uivis1]
    this._core.ui.setstate("ui_dev");
    this._core.ui.setstate("ui_tests_vis");

    // 2026-06-14, Composer: settings dev_debug_state persistence [stgs1]
    this.settings.start(this._core);

    // 2026-06-14, Composer: ui.click test via eventsbus [uiclk1]
    this._ui_click_id = this._core.eventsbus.on("ui.click", ({ key, event }) => {
      if (event === "debug_button") {
        this.settings.dev_debug_state = !this.settings.dev_debug_state;
        this.settings.apply(this._core);
        return;
      }
      console.log("ui click", key, event);
    });
  }

  /**
   * @returns {void}
   */
  stop() {
    if (this._ui_click_id != null) {
      this._core.eventsbus.off(this._ui_click_id);
      this._ui_click_id = null;
    }
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt) {
    this._update_camera_orbit(dt);
    this._sync_toy_decor();
  }

  /**
   * @returns {void}
   */
  _sync_toy_decor() {
    const entity = this.toy?.entity;
    if (!entity) {
      return;
    }

    const { x, y, z } = entity.position;
    if (this.label3d) {
      this.label3d.position.set(x, y + 0.65, z);
      this.label3d.update();
    }
    if (this.ping) {
      this.ping.position.set(x, y + 1.1, z);
      this.ping.updateMatrix();
    }
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
// 2026-06-14, Composer: ui_dev state shows dev panel elements [uivis1]
// 2026-06-14, Composer: settings dev_debug_state persistence [stgs1]
// 2026-06-14, Composer: floor collision via mesh-less floor_toy [flty1]
// 2026-06-14, Composer: spawn box_test_toy via toybox [pltoy1]
// 2026-06-14, Composer: floor tex0 via environment floorstyle [plflr1]
// 2026-06-14, Composer: db text label via scene.text in Ui [uidb6]
// 2026-06-14, Composer: ui.click test via eventsbus [uiclk1]
// 2026-06-14, Composer: weld 3D and UI test text labels [txtwld1]
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
// 2026-06-14, Composer: one instanced box via draw.model [t3pl1]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: import core from src/core [g7c9e3]
