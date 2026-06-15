/** @namespace ty */
import * as THREE from "three";
import logger from "../logger.js";
import { TyntextCore } from "./tyntext.js";
import { cache, v3up } from "../math.js";
import { DitheredOpacity } from "../render/materials/DitheredOpacity.js";
import { ExtendedMaterial } from "../render/materials/ExtendedMaterial.js";
import {
  MeshSpritesheetMaterial,
  SpriteMaterialExtension,
} from "../render/materials/sprite.js";
import Environment from "../scene/environment.js";
import { oimo } from "../lib/OimoPhysics.js";
import { RigidBody, RigidBodyType } from "./physics.js";

const _billboardMatrix = new THREE.Matrix4();

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
   * @param {import("./physics.js").default} physics
   */
  constructor(draw, db, assets, physics) {
    this._draw = draw;
    this._db = db;
    this._assets = assets;
    // 2026-06-14, Composer: scene owns body pool and physics weld [scnbd2]
    this._physics = physics;
    this.tyntext = new TyntextCore(draw, db, assets);
    // 2026-06-14, Composer: scene environment floor lights csm [scnenv1]
    this.environment = new Environment(draw._render, assets);
    this._billboards = {};
    /** @type {Record<string, oimo.dynamics.rigidbody.RigidBody[]>} */
    this._body_pool = {};
    this._body_cache = {
      vec3: new oimo.common.Vec3(),
      transform: new oimo.common.Transform(),
    };
  }

  /**
   * @returns {void}
   */
  start() {
    // 2026-06-14, Composer: environment start uses config only [scnenv2]
    this.environment.start();
  }

  /**
   * @returns {void}
   */
  stop() {
    this.environment.stop();
    this._clear_body_pool();
  }

  // 2026-06-14, Composer: expose draw db getters for Ui [scnui1]
  /** @returns {import("./draw.js").default} */
  get draw() {
    return this._draw;
  }

  /** @returns {import("./db.js").default} */
  get db() {
    return this._db;
  }

  /**
   * @param {string} fontkey
   * @param {boolean} [ui]
   * @returns {import("./tyntext.js").Tyntext|null}
   */
  text(fontkey, ui = true) {
    const text = this.tyntext.maketext(fontkey, ui);
    // 2026-06-14, Composer: wire Tyntext inline #[sprite] tokens [sprfac1]
    text?.setspritefactory((name, asUi) => this.makesprite(name, asUi), ui);
    return text;
  }

  /**
   * @param {string} name
   * @param {boolean} [ui]
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  sprite(name, ui = false) {
    return this.makesprite(name, ui);
  }

  /**
   * @param {string} name
   * @param {boolean} [ui]
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  makesprite(name, ui = false) {
    const drawcore = this._draw.core;
    if (!drawcore) {
      logger.error(`Scene::makesprite drawcore not ready`);
      return null;
    }

    const spriteconf = this._db.get("sprites")?.getconfig(name);
    if (!spriteconf) {
      logger.error(
        `Scene::makesprite "${name}" error: no sprite "${name}" declared`,
      );
      return null;
    }

    const sourcekey = spriteconf["source"];
    const sourceconf = this._db.get("files")?.getconfig(sourcekey);
    const file = this._assets.file(sourcekey);
    if (!file) {
      logger.error(
        `Scene::makesprite "${name}" error: no source "${sourcekey}" preloaded`,
      );
      return null;
    }

    const key = `sprite-${sourcekey}-tasset${ui ? "-ui" : ""}`;

    let imesh = drawcore.getimesh(key);
    if (!imesh) {
      const material = new ExtendedMaterial(
        MeshSpritesheetMaterial,
        [SpriteMaterialExtension, DitheredOpacity],
        {
          map: file,
          emissiveMap: file,
          emissive: 0xffffff,
          alphaTest: 0.2,
          emissiveIntensity: 0,
          color: 0xffffff,
          opacity: 1,
        },
      );
      material.side = THREE.DoubleSide;
      const geometry = new THREE.PlaneGeometry();
      imesh = drawcore.initimesh(
        key,
        geometry,
        material,
        {
          castShadow: false,
          culling: !ui,
        },
        ui ? this._draw.sceneui : this._draw.scene,
      );
      drawcore.inituniforms(key, {
        color: "vec3",
        emissive: "vec3",
        opacity: "float",
        frames: "float",
        frame: "float",
        cells_w: "float",
        cells_h: "float",
      });
      logger.log(`Scene::makesprite. Made ${key} instance`);
    }

    const mesh = drawcore.makemesh(key);
    if (!mesh) {
      return null;
    }

    imesh.setColorAt(mesh.id, cache.color0.setHex(0xffffff));
    mesh.setUniform(
      "emissive",
      cache.color0.setHex(0xffffff).multiplyScalar(1),
    );
    mesh.setUniform("opacity", 0.7);
    mesh.setUniform("frames", sourceconf?.["frames"] ?? 1);
    mesh.setUniform("frame", spriteconf["index"] ?? 0);
    mesh.setUniform("cells_w", sourceconf?.["w"] ?? 1);
    mesh.setUniform("cells_h", sourceconf?.["h"] ?? 1);

    const scale = spriteconf["size"] ?? 1;
    mesh.scale.setScalar(scale);
    mesh.updateMatrix();

    if (spriteconf["billboard"]) {
      this._billboards[key + mesh.id] = mesh;
    }

    return mesh;
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
        receiveShadow: true,
      }, this._draw.pivot);
    }

    const entity = core.makemesh(template_name);
    if (!entity) {
      return null;
    }

    return { key: template_name, entity };
  }

  /**
   * @param {string} name bodies db key
   * @returns {oimo.dynamics.rigidbody.RigidBody|null}
   */
  makebody(name) {
    // 2026-06-14, Composer: pooled makebody delbody by bodies db name [scnbd1]
    const pool = this._body_pool[name];
    let body = null;
    if (pool?.length) {
      body = pool.pop();
      this._reset_body(body);
    } else {
      body = this._create_body(name);
    }
    if (!body) {
      return null;
    }
    this._physics.addBody(body);
    return body;
  }

  /**
   * @param {string} name bodies db key
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @returns {void}
   */
  delbody(name, body) {
    if (!body) {
      return;
    }
    this._physics.remove(body);
    this._reset_body(body);
    if (!this._body_pool[name]) {
      this._body_pool[name] = [];
    }
    this._body_pool[name].push(body);
  }

  /**
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @param {import("@three.ez/instanced-mesh").InstancedEntity} entity
   * @param {object} [opts]
   * @returns {void}
   */
  weldbody(body, entity, opts) {
    this._physics.weld(body, entity, opts);
  }

  /**
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {void}
   */
  setBodyPosition(body, x, y, z) {
    this._physics.setBodyPosition(body, x, y, z);
  }

  /**
   * @param {string} name
   * @returns {oimo.dynamics.rigidbody.RigidBody|null}
   */
  _create_body(name) {
    const bodyconf = this._db.get("bodies")?.getconfig(name);
    if (!bodyconf) {
      logger.error(`Scene::_create_body error: no body "${name}" declared`);
      return null;
    }

    const rbody_config = new oimo.dynamics.rigidbody.RigidBodyConfig();
    rbody_config.position.init(0, 1, 0);
    rbody_config.type = bodyconf.dynamics
      ? RigidBodyType.DYNAMIC
      : RigidBodyType.STATIC;
    rbody_config.angularDamping = bodyconf.adamping ?? 1;
    rbody_config.linearDamping = bodyconf.ldamping ?? 1;

    const body = new RigidBody(rbody_config);
    let geometry = null;

    switch (bodyconf.shape) {
      case "box":
        geometry = new oimo.collision.geometry.BoxGeometry(
          this._body_cache.vec3.init(
            (bodyconf.w ?? 1) * 0.5,
            (bodyconf.h ?? 1) * 0.5,
            (bodyconf.l ?? 1) * 0.5,
          ),
        );
        break;
      default:
        logger.error(
          `Scene::_create_body error: unsupported shape "${bodyconf.shape}"`,
        );
        return null;
    }

    if (geometry) {
      const rshape_config = new oimo.dynamics.rigidbody.ShapeConfig();
      rshape_config.geometry = geometry;
      rshape_config.density = bodyconf.density ?? 1;
      rshape_config.friction = bodyconf.friction ?? 1;
      rshape_config.restitution = bodyconf.restitution ?? 0;
      const rshape = new oimo.dynamics.rigidbody.Shape(rshape_config);
      body.addShape(rshape);
    }

    body.setGravityScale(bodyconf.gravityscale ?? 1);
    return body;
  }

  /**
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @returns {void}
   */
  _reset_body(body) {
    const v = this._body_cache.vec3.init(0, 1, 0);
    const t = this._body_cache.transform;
    t.setPosition(v);
    body.setTransform(t);
    body.setLinearVelocity(this._body_cache.vec3.init(0, 0, 0));
    body.setAngularVelocity(this._body_cache.vec3.init(0, 0, 0));
  }

  /**
   * @returns {void}
   */
  _clear_body_pool() {
    for (const k in this._body_pool) {
      delete this._body_pool[k];
    }
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt) {
    this.tyntext.step(dt);
    this.environment.step(dt);

    // 2026-06-14, Composer: billboard sprites face render camera [sprfac1]
    const camera = this._draw._render?.camera;
    if (camera) {
      for (const k in this._billboards) {
        const b = this._billboards[k];
        _billboardMatrix.compose(b.position, b.quaternion, b.scale);
        _billboardMatrix.lookAt(camera.position, b.position, v3up);
        b.position.setFromMatrixPosition(_billboardMatrix);
        b.quaternion.setFromRotationMatrix(_billboardMatrix);
        b.updateMatrix();
      }
    }

    this.updateInstancedBounds();
  }

  /**
   * @returns {void}
   */
  updateInstancedBounds() {
    const drawcore = this._draw.core;
    if (!drawcore) {
      return;
    }

    // 2026-06-14, Composer: refresh bounds for culled instanced meshes [scnbs1]
    for (const key in drawcore.imeshes) {
      const imesh = drawcore.imeshes[key];
      if (imesh.frustumCulled || imesh.perObjectFrustumCulled) {
        imesh.computeBoundingSphere();
      }
    }
  }
}

export default Scene;
// 2026-06-14, Composer: pooled makebody delbody by bodies db name [scnbd1]
// 2026-06-14, Composer: scene owns body pool and physics weld [scnbd2]
// 2026-06-14, Composer: scene environment floor lights csm [scnenv1]
// 2026-06-14, Composer: environment start uses config only [scnenv2]
// 2026-06-14, Composer: expose draw db getters for Ui [scnui1]
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
// 2026-06-14, Composer: wire Tyntext inline #[sprite] tokens [sprfac1]
// 2026-06-14, Composer: refresh bounds for culled instanced meshes [scnbs1]
// 2026-06-14, Composer: billboard sprites face render camera [sprfac1]
