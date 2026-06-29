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
const _rbSize = new THREE.Vector2();
const _whiteTex = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
);
_whiteTex.needsUpdate = true;

class ElementValue {
  /**
   * @param {number} value
   * @param {ElementValue|null} pivot
   */
  constructor(value, pivot) {
    /** @type {number} */
    this.value = value;
    /** @type {ElementValue|null} */
    this.pivot = pivot ?? null;
  }

  get() {
    // 2026-06-14, Composer: layout value plus optional pivot chain [uipvt1]
    return this.value + (this.pivot?.get() ?? 0);
  }

  set(value) {
    this.value = value;
  }
}

/**
 * @typedef {Object} UiPanelElement
 * @property {"panel"} kind
 * @property {string} name
 * @property {import("@three.ez/instanced-mesh").InstancedEntity} mesh
 * @property {Record<string, any>} conf
 * @property {boolean} interactive
 * @property {boolean} enabled
 * @property {ElementValue} x
 * @property {ElementValue} y
 * @property {ElementValue} rx
 * @property {ElementValue} ry
 * @property {ElementValue} z
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
 * @property {number} anchorx
 * @property {number} anchory
 * @property {number} statecount
 */

/**
 * @typedef {Object} UiTextElement
 * @property {"text"} kind
 * @property {string} name
 * @property {import("./tyntext.js").Tyntext} text
 * @property {Record<string, any>} conf
 * @property {ElementValue} x
 * @property {ElementValue} y
 * @property {ElementValue} rx
 * @property {ElementValue} ry
 * @property {ElementValue} z
 * @property {number} fontsize
 * @property {number} opacity
 * @property {number} anchorx
 * @property {number} anchory
 * @property {number} statecount
 */

/**
 * @typedef {Object} UiSpriteElement
 * @property {"sprite"} kind
 * @property {string} name
 * @property {import("@three.ez/instanced-mesh").InstancedEntity} mesh
 * @property {Record<string, any>} conf
 * @property {ElementValue} x
 * @property {ElementValue} y
 * @property {ElementValue} rx
 * @property {ElementValue} ry
 * @property {ElementValue} z
 * @property {number} size
 * @property {number} glow
 * @property {number} opacity
 * @property {number} anchorx
 * @property {number} anchory
 * @property {number} statecount
 */

/** @typedef {UiPanelElement | UiTextElement | UiSpriteElement} UiElement */

/**
 * @class Ui
 * @memberof pb.core
 */
class Ui {
  /**
   * @param {import("./scene.js").default} scene
   * @param {import("./eventsbus.js").default} eventsbus
   * @param {import("./lang.js").default} lang
   */
  constructor(scene, eventsbus, lang) {
    // 2026-06-14, Composer: Ui takes scene instead of draw db [uiscn1]
    this._scene = scene;
    this._eventsbus = eventsbus;
    // 2026-06-14, Composer: resolve ui text attrs via lang keys [uilng1]
    this._lang = lang;
    /** @type {Record<string, UiElement>} */
    this.elements = {};
    /** @type {Record<number, string>} */
    this._panels_id_tokey = {};
    /** @type {Array<object>} */
    this._raycache = [];
    /** @type {number|null} */
    this._click_id = null;
    this._built = false;
    /** @type {Record<string, boolean>} */
    this.states = {};
  }

  /**
   * @returns {this}
   */
  init() {
    // 2026-06-17, Composer: core init drives all children [crcyc5]
    return this;
  }

  /**
   * @returns {void}
   */
  _build_elements() {
    // 2026-06-14, Composer: build panels from ui_elements scope [uisc1]
    let count = 0;
    this._scene.db.scope("ui_elements", (entry) => {
      const keys = entry.getkeys();
      for (const key of keys) {
        const conf = entry.getconfig(key);
        if (!conf) {
          continue;
        }
        if (conf.type === "panel") {
          this._make_panel(key, conf);
          count++;
        } else if (conf.type === "text") {
          // 2026-06-14, Composer: db text via scene.text [uitxt1]
          this._make_text(key, conf);
          count++;
        } else if (conf.type === "sprite") {
          // 2026-06-14, Composer: db sprite via scene.sprite [uisp1]
          this._make_sprite(key, conf);
          count++;
        }
      }
    });

    logger.log(`Ui::start. ${count} elements made.`);
    this._link_pivots();
  }

  /**
   * @param {Record<string, any>} conf
   * @returns {{ x: ElementValue, y: ElementValue, rx: ElementValue, ry: ElementValue, z: ElementValue }}
   */
  _make_layout_vals(conf) {
    return {
      x: new ElementValue(conf.x ?? 0),
      y: new ElementValue(conf.y ?? 0),
      rx: new ElementValue(conf.rx ?? 0),
      ry: new ElementValue(conf.ry ?? 0),
      z: new ElementValue(conf.z ?? 0),
    };
  }

  /**
   * @returns {void}
   */
  _link_pivots() {
    // 2026-06-14, Composer: db pivot key chains x/y/rx/ry/z [uipvt2]
    for (const k in this.elements) {
      const element = this.elements[k];
      const pivotKey = element.conf?.pivot;
      if (!pivotKey) {
        continue;
      }
      const pivot = this.elements[pivotKey];
      if (!pivot) {
        logger.error(`Ui::_link_pivots "${k}" pivot "${pivotKey}" not found`);
        continue;
      }
      element.x.pivot = pivot.x;
      element.y.pivot = pivot.y;
      element.rx.pivot = pivot.rx;
      element.ry.pivot = pivot.ry;
      element.z.pivot = pivot.z;
    }
  }

  /**
   * @returns {void}
   */
  updatestate() {
    for (const k in this.elements) {
      this.updateelement(k);
    }
  }

  /**
   * @param {string} key
   * @returns {void}
   */
  updateelement(key) {
    const element = this.elements[key];
    if (!element) {
      return;
    }

    this._configure_element(element, element.conf);

    let statecount = 0;
    for (const stateKey in this.states) {
      if (!this.states[stateKey]) {
        continue;
      }
      const statedb = this._scene.db.get(stateKey);
      if (!statedb) {
        continue;
      }

      let referenced = false;
      for (const k of statedb.getkeys()) {
        const conf = statedb.getconfig(k);
        if (!this._conf_references_element(conf, key, element.conf?.group, k)) {
          continue;
        }
        referenced = true;
        this._configure_element(element, conf);
      }
      if (referenced) {
        statecount++;
      }
    }

    // 2026-06-14, Composer: statecount from active state refs in updateelement [uivis2]
    element.statecount = statecount;
    this._apply_element_visible(element);
  }

  /**
   * @param {Record<string, any>} conf
   * @param {string} elementKey
   * @param {string|undefined} group
   * @param {string} [stateKey]
   * @returns {boolean}
   */
  _conf_references_element(conf, elementKey, group, stateKey) {
    const el = conf?.element ?? conf?.name ?? stateKey;
    if (el === elementKey || (group && el === group)) {
      return true;
    }
    if (Array.isArray(el)) {
      return el.includes(elementKey);
    }
    return false;
  }

  /**
   * @param {UiElement} element
   * @returns {boolean}
   */
  _element_shown(element) {
    return element.statecount > 0;
  }

  /**
   * @param {UiElement} element
   * @returns {void}
   */
  _apply_element_visible(element) {
    if (element.kind === "text") {
      element.text.opacity = this._element_shown(element) ? element.opacity : 0;
      element.text.update();
      return;
    }
    element.mesh.visible =
      this._element_shown(element) && element.opacity > 1e-3;
  }

  /**
   * @param {UiElement} element
   * @param {Record<string, any>} conf
   * @returns {void}
   */
  _configure_element(element, conf) {
    if (!conf) {
      return;
    }

    if (conf.x !== undefined) {
      element.x.set(conf.x);
    }
    if (conf.y !== undefined) {
      element.y.set(conf.y);
    }
    if (conf.rx !== undefined) {
      element.rx.set(conf.rx);
    }
    if (conf.ry !== undefined) {
      element.ry.set(conf.ry);
    }
    if (conf.z !== undefined) {
      element.z.set(conf.z);
    }
    if (conf.anchorx !== undefined) {
      element.anchorx = conf.anchorx;
    }
    if (conf.anchory !== undefined) {
      element.anchory = conf.anchory;
    }

    if (element.kind === "panel") {
      if (conf.w !== undefined) {
        element.w = conf.w;
      }
      if (conf.h !== undefined) {
        element.h = conf.h;
      }
      if (conf.scale !== undefined) {
        element.scale = conf.scale;
      }
      if (conf.color !== undefined) {
        element.color = conf.color;
      }
      if (conf.colorb !== undefined) {
        element.colorb = conf.colorb;
      }
      if (conf.glow !== undefined) {
        element.glow = conf.glow;
      }
      if (conf.opacity !== undefined) {
        element.opacity = conf.opacity;
      }
      if (conf.corner !== undefined) {
        element.corner = conf.corner;
      }
      if (conf.pilldome !== undefined) {
        element.pillDome = conf.pilldome;
      }
      if (conf.edgesharp !== undefined) {
        element.edgeSharp = conf.edgesharp;
      }
      if (conf.edgewidth !== undefined) {
        element.edgeWidth = conf.edgewidth;
      }
      this._apply_panel_uniforms(element);
      return;
    }

    if (element.kind === "text") {
      if (conf.text !== undefined) {
        element.text.text = this._lang.get(conf.text);
      }
      if (conf.fontsize !== undefined) {
        element.fontsize = conf.fontsize;
      }
      if (conf.color !== undefined) {
        element.text.color = conf.color;
      }
      if (conf.colorb !== undefined || conf.emissive !== undefined) {
        element.text.emissive = conf.colorb ?? conf.emissive;
      }
      if (conf.glow !== undefined) {
        element.text.glow = conf.glow;
      }
      if (conf.opacity !== undefined) {
        element.opacity = conf.opacity;
        element.text.opacity = conf.opacity;
      }
      if (conf.anchorx !== undefined || conf.anchory !== undefined) {
        element.anchorx = conf.anchorx ?? element.anchorx;
        element.anchory = conf.anchory ?? element.anchory;
        element.text.anchor.set(element.anchorx, element.anchory);
      }
      return;
    }

    if (element.kind === "sprite") {
      if (conf.size !== undefined) {
        element.size = conf.size;
      }
      if (conf.glow !== undefined) {
        element.glow = conf.glow;
      }
      if (conf.opacity !== undefined) {
        element.opacity = conf.opacity;
        // 2026-06-14, Composer: sync sprite opacity uniform on state [uiop1]
        element.mesh.setUniform("opacity", element.opacity);
      }
      if (conf.colorb !== undefined) {
        element.mesh.setUniform(
          "emissive",
          cache.color0.setHex(conf.colorb).multiplyScalar(element.glow),
        );
      }
    }
  }

  /**
   * @param {...(string|Array<string>)} args
   * @returns {void}
   */
  triggerstate(...args) {
    // 2026-06-14, Composer: +/-/~ state tokens from panel triggerstate [uist1]
    const tokens = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        tokens.push(...arg);
      } else if (typeof arg === "string") {
        tokens.push(arg);
      }
    }

    logger.log(`Ui::triggerstate. ${tokens.join(",")}`);
    for (const token of tokens) {
      switch (token[0]) {
        case "-":
          this.delstate(token.slice(1));
          break;
        case "+":
          this.setstate(token.slice(1));
          break;
        case "~":
          this.togglestate(token.slice(1));
          break;
        default:
          this.setstate(token);
          break;
      }
    }
  }

  /**
   * @param {string} key
   * @returns {void}
   */
  togglestate(key) {
    if (this.states[key]) {
      this.delstate(key);
    } else {
      this.setstate(key);
    }
  }

  /**
   * @param {string} key
   * @returns {void}
   */
  setstate(key) {
    if (this.states[key]) {
      return;
    }
    this.states[key] = true;
    this.updatestate();
    this._eventsbus.emit("ui.state", { action: "set", key });
  }

  /**
   * @param {string} key
   * @returns {void}
   */
  delstate(key) {
    if (!this.states[key]) {
      return;
    }
    this.states[key] = false;
    this.updatestate();
    this._eventsbus.emit("ui.state", { action: "del", key });
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  hasstate(key) {
    return this.states[key] ?? false;
  }

  /**
   * @returns {void}
   */
  clearallstates() {
    const cleared = [];
    for (const key in this.states) {
      if (this.states[key]) {
        this.states[key] = false;
        cleared.push(key);
      }
    }
    if (!cleared.length) {
      return;
    }
    this.updatestate();
    for (const key of cleared) {
      this._eventsbus.emit("ui.state", { action: "del", key });
    }
  }

  /**
   * @param {string} key
   * @param {Record<string, any>} conf
   * @returns {Array<string>|null}
   */
  _get_panel_triggerstate(key, conf) {
    for (const stateKey in this.states) {
      if (!this.states[stateKey]) {
        continue;
      }
      const statedb = this._scene.db.get(stateKey);
      const stateconf = statedb?.getconfig(key);
      if (stateconf?.triggerstate) {
        return this._normalize_triggerstate(stateconf.triggerstate);
      }
    }
    return this._normalize_triggerstate(conf?.triggerstate);
  }

  /**
   * @param {string|Array<string>|undefined} triggerstate
   * @returns {Array<string>|null}
   */
  _normalize_triggerstate(triggerstate) {
    if (!triggerstate) {
      return null;
    }
    if (Array.isArray(triggerstate)) {
      return triggerstate;
    }
    if (typeof triggerstate === "string") {
      const trimmed = triggerstate.trim();
      if (trimmed[0] === "[" && trimmed[trimmed.length - 1] === "]") {
        return trimmed
          .slice(1, -1)
          .replaceAll(" ", "")
          .split(",")
          .filter(Boolean);
      }
      return [trimmed];
    }
    return null;
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
      kind: "panel",
      name,
      mesh,
      conf,
      interactive: conf.interactive === true,
      enabled: true,
      ...this._make_layout_vals(conf),
      w: conf.w ?? 35,
      h: conf.h ?? 8,
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
      anchorx: conf.anchorx ?? 0.5,
      anchory: conf.anchory ?? 0.5,
      statecount: 0,
    };

    this.elements[name] = element;
    this._panels_id_tokey[mesh.id] = name;
    this._apply_panel_uniforms(element);
    mesh.visible = false;
    mesh.updateMatrix();
  }

  /**
   * @param {string} name
   * @param {Record<string, any>} conf
   * @returns {void}
   */
  _make_text(name, conf) {
    const font = conf.font ?? "afont";
    const text = this._scene.text(font, true);
    if (!text) {
      logger.error(`Ui::_make_text "${name}" font "${font}" not found`);
      return;
    }

    text.text = this._lang.get(conf.text ?? conf.label ?? name);
    text.color = conf.color ?? 0xffffff;
    text.emissive = conf.colorb ?? conf.emissive ?? 0xffffff;
    text.glow = conf.glow ?? 1;
    text.opacity = conf.opacity ?? 1;
    text.anchor.set(conf.anchorx ?? 0.5, conf.anchory ?? 0.5);

    const element = {
      kind: "text",
      name,
      text,
      conf,
      ...this._make_layout_vals(conf),
      fontsize: conf.fontsize ?? 4,
      opacity: conf.opacity ?? 1,
      anchorx: conf.anchorx ?? 0.5,
      anchory: conf.anchory ?? 0.5,
      statecount: 0,
    };

    this.elements[name] = element;
    this._layout_text(element);
  }

  /**
   * @param {string} name
   * @param {Record<string, any>} conf
   * @returns {void}
   */
  _make_sprite(name, conf) {
    const spriteName = conf.sprite ?? name;
    const mesh = this._scene.sprite(spriteName, true);
    if (!mesh) {
      logger.error(`Ui::_make_sprite "${name}" sprite "${spriteName}" not found`);
      return;
    }

    const element = {
      kind: "sprite",
      name,
      mesh,
      conf,
      ...this._make_layout_vals(conf),
      size: conf.size ?? 4,
      glow: conf.glow ?? 1,
      opacity: conf.opacity ?? 1,
      anchorx: conf.anchorx ?? 0.5,
      anchory: conf.anchory ?? 0.5,
      statecount: 0,
    };

    mesh.setUniform("opacity", element.opacity);
    mesh.setUniform(
      "emissive",
      cache.color0.setHex(conf.colorb ?? 0xffffff).multiplyScalar(element.glow),
    );

    this.elements[name] = element;
    this._layout_sprite(element);
  }

  /**
   * @param {UiSpriteElement} element
   * @returns {void}
   */
  _layout_sprite(element) {
    const ww = this._scene.draw.width;
    const wh = this._scene.draw.height;
    const wmin = this._get_wmin();
    const m = element.mesh;

    const x = this._layout_x(element, ww, wmin);
    const y = this._layout_y(element, wh, wmin);
    // 2026-06-14, Composer: sprite size pct of wmin [uisz1]
    const worldSize = this._pct(element.size) * wmin;
    const half = worldSize * 0.5;
    const pos = this._layout_anchor_pos(x, y, element.anchorx, element.anchory, half, half);

    m.position.set(pos.x, pos.y, this._layout_z(element));
    m.scale.setScalar(worldSize);
    m.setUniform("opacity", element.opacity);
    m.visible = this._element_shown(element) && element.opacity > 1e-3;
    m.updateMatrix();
  }

  /**
   * @param {UiTextElement} element
   * @returns {void}
   */
  _layout_text(element) {
    const ww = this._scene.draw.width;
    const wh = this._scene.draw.height;
    const wmin = this._get_wmin();

    const x = this._layout_x(element, ww, wmin);
    const y = this._layout_y(element, wh, wmin);
    // 2026-06-14, Composer: text fontsize pct of wmin [uifs1]
    element.text.fontsize = this._pct(element.fontsize) * wmin;
    element.text.position.set(x, y, this._layout_z(element));
    element.text.anchor.set(element.anchorx, element.anchory);
    element.text.opacity = this._element_shown(element) ? element.opacity : 0;
    element.text.update();
  }

  /**
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  _make_panel_mesh() {
    const drawcore = this._scene.draw.core;
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
        this._scene.draw.sceneui,
      );
      // 2026-06-14, Composer: drop unused skewx quality panel uniforms [uirb1]
      drawcore.inituniforms(PANEL_MESH_KEY, {
        opacity: "float",
        emissive: "vec3",
        color: "vec3",
        color_highlight: "vec3",
        rbSize: "vec2",
        rbRef: "float",
        corner: "float",
        pillDome: "float",
        edgeSharp: "float",
        edgeWidth: "float",
      });
    }

    return drawcore.makemesh(PANEL_MESH_KEY);
  }

  /**
   * @param {UiPanelElement} element
   * @returns {void}
   */
  _apply_panel_uniforms(element) {
    const m = element.mesh;
    m.setUniform("opacity", element.opacity);
    // 2026-06-14, Composer: color mat, emissive colorb light [rbmix1]
    m.setUniform("pillDome", element.pillDome);
    m.setUniform("edgeSharp", element.edgeSharp);
    // 2026-06-14, Composer: edgeWidth db 0-100 pct of wmin [uiedg1]
    m.setUniform("edgeWidth", this._pct(element.edgeWidth));
    // 2026-06-14, Composer: body via color uniform not setColorAt [uicol1]
    m.setUniform("color", cache.color0.setHex(element.color));
    m.setUniform("emissive", cache.color0.setHex(element.colorb).multiplyScalar(element.glow));
    m.setUniform("color_highlight", cache.color0.setHex(element.colorb));
  }

  /**
   * @returns {number}
   */
  _get_wmin() {
    return Math.min(this._scene.draw.width, this._scene.draw.height);
  }

  /**
   * Db layout attrs (not anchor/scale) use 0–100 percentage, not 0–1 fraction.
   * @param {number} v
   * @returns {number}
   */
  _pct(v) {
    // 2026-06-14, Composer: db transform attrs as percentage [uipct1]
    return v * 0.01;
  }

  /**
   * @param {{ z: ElementValue }} element
   * @returns {number}
   */
  _layout_z(element) {
    // 2026-06-14, Composer: z layer offset for ui draw order [uiz1]
    return element.z.get();
  }

  /**
   * @param {{ x: ElementValue, rx: ElementValue }} element
   * @param {number} ww
   * @param {number} wmin
   * @returns {number}
   */
  _layout_x(element, ww, wmin) {
    return (this._pct(element.x.get()) - 0.5) * ww + this._pct(element.rx.get()) * wmin;
  }

  /**
   * @param {{ y: ElementValue, ry: ElementValue }} element
   * @param {number} wh
   * @param {number} wmin
   * @returns {number}
   */
  _layout_y(element, wh, wmin) {
    // 2026-06-14, Composer: y=0 bottom, positive y and ry up [uiyfl1]
    return (this._pct(element.y.get()) - 0.5) * wh + this._pct(element.ry.get()) * wmin;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} anchorx
   * @param {number} anchory
   * @param {number} halfW
   * @param {number} halfH
   * @returns {{ x: number, y: number }}
   */
  _layout_anchor_pos(x, y, anchorx, anchory, halfW, halfH) {
    // 2026-06-14, Composer: anchor 0-1, layout attrs 0-100 pct [uian2]
    return {
      x: x + (0.5 - anchorx) * 2 * halfW,
      y: y + (0.5 - anchory) * 2 * halfH,
    };
  }

  /**
   * @param {UiPanelElement} element
   * @returns {void}
   */
  _layout_panel(element) {
    const ww = this._scene.draw.width;
    const wh = this._scene.draw.height;
    const wmin = this._get_wmin();
    const m = element.mesh;

    const x = this._layout_x(element, ww, wmin);
    const y = this._layout_y(element, wh, wmin);
    // 2026-06-14, Composer: w/h pct of wmin, scale 0-1 [uiwh1]
    const fullW = element.scale * this._pct(element.w) * wmin;
    const fullH = element.scale * this._pct(element.h) * wmin;
    const hw = fullW * 0.5;
    const hh = fullH * 0.5;
    const pos = this._layout_anchor_pos(x, y, element.anchorx, element.anchory, hw, hh);

    m.position.set(pos.x, pos.y, this._layout_z(element));
    // 2026-06-14, Composer: unit square mesh scaled to panel w/h [uimesh1]
    m.scale.set(fullW, fullH, 1);
    m.setUniform("rbSize", _rbSize.set(hw, hh));
    m.setUniform("rbRef", wmin);
    // 2026-06-14, Composer: corner db 0-1 not layout pct [uicrn2]
    m.setUniform("corner", element.corner);
    m.visible = this._element_shown(element) && element.opacity > 1e-3;
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt, _rdt) {
    for (const k in this.elements) {
      const element = this.elements[k];
      if (element.kind === "text") {
        this._layout_text(element);
      } else if (element.kind === "sprite") {
        this._layout_sprite(element);
      } else {
        this._layout_panel(element);
        element.mesh.updateMatrix();
      }
    }
  }

  /**
   * @returns {void}
   */
  start() {
    // 2026-06-14, Composer: build panels from ui_elements scope [uisc1]
    if (!this._built) {
      this._build_elements();
      this._built = true;
      this.updatestate();
    }

    if (this._click_id !== null) {
      return;
    }

    // 2026-06-14, Composer: rename run to start on inputs ui [crn1]
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
    const triggerstate = this._get_panel_triggerstate(key, conf);
    if (triggerstate?.length) {
      this.triggerstate(triggerstate);
    }

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
    const draw = this._scene.draw;
    const cameraui = draw.cameraui;
    const imesh = draw.core?.getimesh(PANEL_MESH_KEY);
    if (!cameraui || !imesh) {
      return null;
    }

    // 2026-06-28, Composer: panel raycast NDC via draw.pointer_ndc [drwptr1]
    if (!draw.pointer_ndc(x, y, _pointer)) {
      return null;
    }
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
      if (
        panel?.kind !== "panel" ||
        !panel.enabled ||
        !panel.interactive ||
        panel.statecount <= 0 ||
        panel.opacity <= 0
      ) {
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
      const element = this.elements[k];
      if (element.kind === "text") {
        element.text.remove();
      } else {
        element.mesh.remove();
      }
      delete this.elements[k];
    }
    this._panels_id_tokey = {};
    this.states = {};
    this._built = false;
    this._scene.draw.core?.delimesh(PANEL_MESH_KEY, true);
  }
}

export default Ui;
// 2026-06-14, Composer: z layer offset for ui draw order [uiz1]
// 2026-06-14, Composer: db pivot key chains x/y/rx/ry [uipvt2]
// 2026-06-14, Composer: text fontsize pct of wmin [uifs1]
// 2026-06-14, Composer: sprite size pct of wmin [uisz1]
// 2026-06-14, Composer: edgeWidth db 0-100 pct of wmin [uiedg1]
// 2026-06-14, Composer: unit square mesh scaled to panel w/h [uimesh1]
// 2026-06-14, Composer: w/h pct of wmin, scale 0-1 [uiwh1]
// 2026-06-14, Composer: anchor 0-1, layout attrs 0-100 pct [uian2]
// 2026-06-14, Composer: db transform attrs as percentage [uipct1]
// 2026-06-14, Composer: +/-/~ state tokens from panel triggerstate [uist1]
// 2026-06-14, Composer: y=0 bottom, positive y and ry up [uiyfl1]
// 2026-06-14, Composer: db sprite via scene.sprite [uisp1]
// 2026-06-14, Composer: resolve ui text attrs via lang keys [uilng1]
// 2026-06-14, Composer: db text via scene.text [uitxt1]
// 2026-06-14, Composer: Ui takes scene instead of draw db [uiscn1]
// 2026-06-14, Composer: build panels from ui_elements scope [uisc1]
// 2026-06-14, Composer: rename run to start on inputs ui [crn1]
// 2026-06-14, Composer: drop unused skewx quality panel uniforms [uirb1]
// 2026-06-14, Composer: body via color uniform not setColorAt [uicol1]
// 2026-06-14, Composer: db attrs lowercase in pug [uidom2]
// 2026-06-14, Composer: default pill uses shader defaults, second pill tuned [uidb2]
// 2026-06-14, Composer: color mat, emissive colorb light [rbmix1]
// 2026-06-14, Composer: scale corner by panel aspect like a_legacy [uicrn1]
// 2026-06-28, Composer: panel raycast NDC via draw.pointer_ndc [drwptr1]
// 2026-06-14, Composer: corner db 0-1 not layout pct [uicrn2]
// 2026-06-14, Composer: minimal panel UI from ui_tests db [uicls1]
// 2026-06-14, Composer: sync sprite opacity uniform on state [uiop1]
// 2026-06-14, Composer: hide elements until active state refs them [uivis1]
// 2026-06-14, Composer: statecount from active state refs in updateelement [uivis2]
// 2026-06-14, Composer: ui_states element falls back to name [uiel1]
