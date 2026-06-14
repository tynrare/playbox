/** @namespace ty */
// 2026-06-14, Composer: minimal panel UI from ui_tests db [uicls1]
import * as THREE from "three";
import logger from "../logger.js";
import { cache } from "../math.js";
import { DitheredOpacity } from "../render/materials/DitheredOpacity.js";
import { ExtendedMaterial } from "../render/materials/ExtendedMaterial.js";
import { RoundedboxMaterialExtension, RoundedboxShaderDefaults } from "../render/materials/roundedbox.js";

const PANEL_MESH_KEY = "pb-ui-panel";
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _whiteTex = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
);
_whiteTex.needsUpdate = true;

/**
 * @typedef {Object} UiElement
 * @property {string} name
 * @property {import("@three.ez/instanced-mesh").InstancedEntity} mesh
 * @property {Record<string, any>} conf
 * @property {boolean} interactive
 * @property {boolean} enabled
 * @property {number} x
 * @property {number} y
 * @property {number} rx
 * @property {number} ry
 * @property {number} w
 * @property {number} h
 * @property {number} scale
 * @property {number} color
 * @property {number} colorb
 * @property {number} glow
 * @property {number} opacity
 * @property {number} corner
 * @property {number} pillDome
 * @property {number} edgeSharp
 * @property {number} edgeWidth
 */

/**
 * @class Ui
 * @memberof pb.core
 */
class Ui {
  /**
   * @param {import("./draw.js").default} draw
   * @param {import("./db.js").default} db
   * @param {import("./eventsbus.js").default} eventsbus
   */
  constructor(draw, db, eventsbus) {
    this._draw = draw;
    this._db = db;
    this._eventsbus = eventsbus;
    /** @type {Record<string, UiElement>} */
    this.elements = {};
    /** @type {Record<number, string>} */
    this._panels_id_tokey = {};
    /** @type {Array<object>} */
    this._raycache = [];
    /** @type {number|null} */
    this._click_id = null;
    this._inited = false;
  }

  /**
   * @returns {void}
   */
  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    const db = this._db.get("ui_tests");
    if (!db) {
      logger.error("Ui::init ui_tests db not found");
      return;
    }

    const keys = db.getkeys();
    for (const key of keys) {
      const conf = db.getconfig(key);
      if (!conf) {
        continue;
      }
      if (conf.type === "panel") {
        this._make_panel(key, conf);
      }
    }

    logger.log(`Ui::init. ${keys.length} elements made.`);
  }

  /**
   * @param {string} name
   * @param {Record<string, any>} conf
   * @returns {void}
   */
  _make_panel(name, conf) {
    const mesh = this._make_panel_mesh();
    if (!mesh) {
      return;
    }

    const element = {
      name,
      mesh,
      conf,
      interactive: conf.interactive === true,
      enabled: true,
      x: conf.x ?? 0.5,
      y: conf.y ?? 0.5,
      rx: conf.rx ?? 0,
      ry: conf.ry ?? 0,
      w: conf.w ?? 0.35,
      h: conf.h ?? 0.08,
      scale: conf.scale ?? 1,
      color: conf.color ?? 0x0,
      colorb: conf.colorb ?? 0xffffff,
      glow: conf.glow ?? 1,
      opacity: conf.opacity ?? 1,
      corner: conf.corner ?? 0.5,
      // 2026-06-14, Composer: db attrs lowercase in pug [uidom2]
      pillDome: conf.pilldome ?? RoundedboxShaderDefaults.pillDome,
      edgeSharp: conf.edgesharp ?? RoundedboxShaderDefaults.edgeSharp,
      edgeWidth: conf.edgewidth ?? RoundedboxShaderDefaults.edgeWidth,
    };

    this.elements[name] = element;
    this._panels_id_tokey[mesh.id] = name;
    this._apply_panel_uniforms(element);
    mesh.visible = true;
    mesh.updateMatrix();
  }

  /**
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  _make_panel_mesh() {
    const drawcore = this._draw.core;
    if (!drawcore) {
      return null;
    }

    if (!drawcore.getimesh(PANEL_MESH_KEY)) {
      const material = new ExtendedMaterial(
        THREE.MeshLambertMaterial,
        [RoundedboxMaterialExtension, DitheredOpacity],
        {
          color: 0xffffff,
          map: _whiteTex,
          emissive: 0xffffff,
          emissiveIntensity: 1,
        },
      );
      material.side = THREE.DoubleSide;
      const geometry = new THREE.PlaneGeometry();
      drawcore.initimesh(
        PANEL_MESH_KEY,
        geometry,
        material,
        { capacity: 16, castShadow: false, culling: false, bvh: true },
        this._draw.sceneui,
      );
      drawcore.inituniforms(PANEL_MESH_KEY, {
        opacity: "float",
        emissive: "vec3",
        color: "vec3",
        color_highlight: "vec3",
        ratiox: "float",
        ratioy: "float",
        corner: "float",
        skewx: "float",
        quality: "float",
        pillDome: "float",
        edgeSharp: "float",
        edgeWidth: "float",
      });
    }

    return drawcore.makemesh(PANEL_MESH_KEY);
  }

  /**
   * @param {UiElement} element
   * @returns {void}
   */
  _apply_panel_uniforms(element) {
    const m = element.mesh;
    m.setUniform("opacity", element.opacity);
    m.setUniform("skewx", 0);
    m.setUniform("quality", 8);
    // 2026-06-14, Composer: color mat, emissive colorb light [rbmix1]
    m.setUniform("pillDome", element.pillDome);
    m.setUniform("edgeSharp", element.edgeSharp);
    m.setUniform("edgeWidth", element.edgeWidth);
    // 2026-06-14, Composer: body via color uniform not setColorAt [uicol1]
    m.setUniform("color", cache.color0.setHex(element.color));
    m.setUniform("emissive", cache.color0.setHex(element.colorb).multiplyScalar(element.glow));
    m.setUniform("color_highlight", cache.color0.setHex(element.colorb));
  }

  /**
   * @returns {number}
   */
  _get_wmin() {
    return Math.min(this._draw.width, this._draw.height);
  }

  /**
   * @param {UiElement} element
   * @returns {void}
   */
  _layout_panel(element) {
    const ww = this._draw.width;
    const wh = this._draw.height;
    const wmin = this._get_wmin();
    const m = element.mesh;

    const x = (element.x - 0.5) * ww + element.rx * wmin;
    const y = (0.5 - element.y) * wh - element.ry * wmin;
    const w = element.scale * element.w * wmin * 0.5;
    const h = element.scale * element.h * wmin * 0.5;
    const scale = Math.max(w, h);

    m.position.set(x, y, 0);
    m.scale.set(scale, scale, 1);
    m.setUniform("ratiox", w / scale);
    m.setUniform("ratioy", h / scale);
    // 2026-06-14, Composer: scale corner by panel aspect like booling [uicrn1]
    const aspect = h > 0 ? Math.min(w / h, h / w) : 1;
    m.setUniform("corner", element.corner * aspect);
    m.visible = element.opacity > 1e-3;
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt) {
    for (const k in this.elements) {
      this._layout_panel(this.elements[k]);
      this.elements[k].mesh.updateMatrix();
    }

    const imesh = this._draw.core?.getimesh(PANEL_MESH_KEY);
    imesh?.computeBoundingSphere();
  }

  /**
   * @returns {void}
   */
  run() {
    this._click_id = this._eventsbus.on("pointer.click", ({ x, y }) => {
      this._on_pointer_click(x, y);
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  _on_pointer_click(x, y) {
    const key = this._trace_panel(x, y);
    if (!key) {
      return;
    }

    const conf = this.elements[key]?.conf;
    this._eventsbus.emit("ui.click", {
      key,
      event: conf?.event ?? key,
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {string|null}
   */
  _trace_panel(x, y) {
    const cameraui = this._draw.cameraui;
    const imesh = this._draw.core?.getimesh(PANEL_MESH_KEY);
    if (!cameraui || !imesh) {
      return null;
    }

    const ww = this._draw.width;
    const wh = this._draw.height;
    _pointer.set((x / ww) * 2 - 1, -(y / wh) * 2 + 1);
    _raycaster.setFromCamera(_pointer, cameraui);

    this._raycache.length = 0;
    imesh.raycast(_raycaster, this._raycache);
    this._raycache.sort((a, b) => a.distance - b.distance);

    for (const intersection of this._raycache) {
      const hovered = this._panels_id_tokey[intersection.instanceId];
      if (!hovered) {
        continue;
      }

      const panel = this.elements[hovered];
      if (!panel?.enabled || !panel.interactive || panel.opacity <= 0) {
        continue;
      }

      const w = panel.w;
      const h = panel.h;
      if (Math.abs(intersection.uv.y - 0.5) > 0.5 / (w > h ? w / h : 1)) {
        continue;
      }
      if (Math.abs(intersection.uv.x - 0.5) > 0.5 / (h > w ? h / w : 1)) {
        continue;
      }

      return hovered;
    }

    return null;
  }

  /**
   * @returns {void}
   */
  stop() {
    if (this._click_id !== null) {
      this._eventsbus.off(this._click_id);
      this._click_id = null;
    }
  }

  /**
   * @returns {void}
   */
  dispose() {
    this.stop();
    for (const k in this.elements) {
      this.elements[k].mesh.remove();
      delete this.elements[k];
    }
    this._panels_id_tokey = {};
    this._draw.core?.delimesh(PANEL_MESH_KEY, true);
  }
}

export default Ui;
// 2026-06-14, Composer: body via color uniform not setColorAt [uicol1]
// 2026-06-14, Composer: db attrs lowercase in pug [uidom2]
// 2026-06-14, Composer: default pill uses shader defaults, second pill tuned [uidb2]
// 2026-06-14, Composer: color mat, emissive colorb light [rbmix1]
// 2026-06-14, Composer: scale corner by panel aspect like booling [uicrn1]
// 2026-06-14, Composer: minimal panel UI from ui_tests db [uicls1]
