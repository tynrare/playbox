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
import Audio from "../scene/audio.js";
import ContactRouter from "../scene/contact_router.js";
import { VAR_FLAGS_MODULES, VAR_MFLAG_CONTACTS } from "../scene/modulebox.js";
import { VAR_BODY_ID } from "../scene/itembox.js";
import { oimo } from "../lib/OimoPhysics.js";
import { RigidBody, RigidBodyType } from "./physics.js";

const _billboardMatrix = new THREE.Matrix4();
const _boundsSrcInv = new THREE.Matrix4();

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
   * @param {import("../scene/toybox.js").default} toybox
   * @param {import("./eventsbus.js").default} eventsbus
   */
  constructor(draw, db, assets, physics, toybox, eventsbus) {
    this._draw = draw;
    this._db = db;
    this._assets = assets;
    // 2026-06-14, Composer: scene owns body pool and physics weld [scnbd2]
    this._physics = physics;
    // 2026-06-26, Composer: scene toybox ref itembox via toybox [scntbx1]
    this._toybox = toybox;
    this._itembox = toybox.itembox;
    this._eventsbus = eventsbus;
    /** @type {number|null} */
    this._on_item_init = null;
    /** @type {number|null} */
    this._on_item_dis = null;
    /** @type {number|null} */
    this._on_toy_init = null;
    /** @type {number|null} */
    this._on_toy_dis = null;
    /** @type {ContactRouter|null} */
    this._contact_router = null;
    this.tyntext = new TyntextCore(draw, db, assets);
    // 2026-06-14, Composer: scene environment floor lights csm [scnenv1]
    this.environment = new Environment(draw._render, assets);
    // 2026-06-27, Composer: scene Howler audiosprite loader [scnau1]
    this.audio = new Audio();
    this._billboards = {};
    /** @type {Record<string, oimo.dynamics.rigidbody.RigidBody[]>} */
    this._body_pool = {};
    this._body_cache = {
      vec3: new oimo.common.Vec3(),
      transform: new oimo.common.Transform(),
    };
    /** @type {Record<string, THREE.Material>} */
    this._cache_materials = {};
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
  start() {
    // 2026-06-14, Composer: environment start uses config only [scnenv2]
    this.environment.start();
    // 2026-06-27, Composer: load audiosprite on scene start [scnau2]
    this.audio.run();
    // 2026-06-26, Composer: ContactRouter wired on item and toy events [scnctr1]
    this._contact_router = new ContactRouter(
      this._eventsbus,
      this._physics,
      this._itembox,
      this._toybox,
    );
    // 2026-06-14, Composer: item init dispose via eventbus listeners [itmbx1]
    // 2026-06-14, Composer: item events pass index scalar [itmhp1]
    this._on_item_init = this._eventsbus.on("item.initialize", (index) => {
      // tbx-lifecycle step 2) itm-scene-sidefx touchpoint
      this.spawn_item(index);
    });
    this._on_item_dis = this._eventsbus.on("item.dispose", (index) => {
      this.despawn_item(index);
    });
    this._on_toy_init = this._eventsbus.on("toy.initialize", (toyIndex) => {
      if (
        this._toybox.mempool.read_flag(
          toyIndex,
          VAR_FLAGS_MODULES,
          VAR_MFLAG_CONTACTS,
        )
      ) {
        this._contact_router?.watch(toyIndex);
      }
    });
    this._on_toy_dis = this._eventsbus.on("toy.dispose", (toyIndex) => {
      this._contact_router?.unwatch(toyIndex);
    });
  }

  /**
   * @returns {void}
   */
  stop() {
    if (this._on_item_init != null) {
      this._eventsbus.off(this._on_item_init);
      this._on_item_init = null;
    }
    if (this._on_item_dis != null) {
      this._eventsbus.off(this._on_item_dis);
      this._on_item_dis = null;
    }
    if (this._on_toy_init != null) {
      this._eventsbus.off(this._on_toy_init);
      this._on_toy_init = null;
    }
    if (this._on_toy_dis != null) {
      this._eventsbus.off(this._on_toy_dis);
      this._on_toy_dis = null;
    }
    if (this._contact_router != null) {
      this._contact_router.dispose();
      this._contact_router = null;
    }
    this.audio.stop();
    this.environment.stop();
    this._clear_body_pool();
  }

  /**
   * @returns {void}
   */
  dispose() {
    // 2026-06-17, Composer: dispose scene physics pools on teardown [crcyc4]
    // 2026-06-26, Composer: dispose cached scene materials [scnmat1]
    for (const key in this._cache_materials) {
      this._cache_materials[key]?.dispose?.();
    }
    this._cache_materials = {};
    this.stop();
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
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  model(name) {
    return this.makemodel(name);
  }

  makemodel(name) {
    const conf = this._db.get("models")?.getconfig(name);
    if (!conf) {
      logger.error(`Scene::makemodel config not found: ${name}`);
      return null;
    }

    // 2026-06-18, Composer: imesh key is model name geometry+material [mdcol1]
    // 2026-06-26, Composer: makemodel gltf source/object branch [scnglt1]
    if (conf["source"] && conf["object"]) {
      return this._makemodel_gltf(name, conf);
    }

    const type = conf["type"];
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

    const w = conf["w"] ?? 1;
    const h = conf["h"] ?? 1;
    const d = conf["d"] ?? 1;
    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = new THREE.MeshStandardMaterial({ map });

    if (!core.getimesh(name)) {
      core.initimesh(name, geometry, material, {
        capacity: 8,
        renderer: this._draw._render.renderer,
        castShadow: true,
        receiveShadow: false,
      }, this._draw.pivot);
    }

    const entity = core.makemesh(name);
    if (!entity) {
      return null;
    }

    // 2026-06-14, Composer: model returns entity only not wrapper [scnmd1]
    return entity;
  }

  /**
   * @param {Record<string, any>} meshconf
   * @param {THREE.Material|THREE.Material[]|null} sourcematerial
   * @returns {THREE.Material}
   */
  _get_material(meshconf, sourcematerial) {
    const sourcekey = meshconf["source"];
    const srcMat = Array.isArray(sourcematerial)
      ? sourcematerial[0]
      : sourcematerial;
    const __materialkey = meshconf["material"];
    const __smaterialkey = srcMat?.name ? `${sourcekey}-${srcMat.name}` : null;
    const materialconf = __materialkey
      ? this._db.get("materials")?.getconfig(__materialkey)
      : null;
    const _materialkey = materialconf ? __materialkey : __smaterialkey;

    const use_scenematerial = !_materialkey;
    const materialkey = use_scenematerial ? "scenematerial" : _materialkey;
    let material = this._cache_materials[materialkey];
    if (!material) {
      const scenematerialconf = use_scenematerial
        ? this._db.get("materials")?.getconfig("scenematerial")
        : materialconf;
      const activeconf = scenematerialconf ?? materialconf;
      const map =
        (use_scenematerial && activeconf?.map
          ? this._assets.file(activeconf.map)
          : null) ||
        (materialconf?.map ? this._assets.file(materialconf.map) : null) ||
        srcMat?.map ||
        null;
      const emissive =
        activeconf?.emissive ??
        materialconf?.emissive ??
        srcMat?.emissive?.getHex?.() ??
        0xffffff;
      const color =
        activeconf?.color ??
        materialconf?.color ??
        srcMat?.color?.getHex?.() ??
        0xffffff;
      const glow =
        activeconf?.glow ??
        materialconf?.glow ??
        srcMat?.emissiveIntensity ??
        0;
      const materialclass = this._get_material_class(
        activeconf?.type ?? materialconf?.type,
      );
      const shininess = activeconf?.shininess ?? materialconf?.shininess;
      // 2026-06-26, Composer: cached ExtendedMaterial DitheredOpacity CSM [scnmat1]
      // 2026-06-26, Composer: material shininess for MeshPhongMaterial [scnph1]
      this._cache_materials[materialkey] = material = new ExtendedMaterial(
        materialclass,
        [DitheredOpacity],
        {
          map: map ?? null,
          emissiveMap: map ?? null,
          emissive: cache.color0.setHex(emissive),
          color: cache.color1.setHex(color),
          emissiveIntensity: glow,
          opacity: activeconf?.opacity ?? materialconf?.opacity ?? 1,
          ...(shininess != null ? { shininess } : {}),
        },
      );
      material.side = THREE.DoubleSide;
      this.environment.csm?.setupMaterial(material);
    }

    return material;
  }

  /**
   * @param {string} [name]
   * @returns {typeof THREE.MeshStandardMaterial}
   */
  _get_material_class(name) {
    switch (name) {
      case "basic":
        return THREE.MeshBasicMaterial;
      case "toon":
        return THREE.MeshToonMaterial;
      case "standard":
        return THREE.MeshStandardMaterial;
      case "lambert":
        return THREE.MeshLambertMaterial;
      case "phong":
        return THREE.MeshPhongMaterial;
      default:
        return THREE.MeshStandardMaterial;
    }
  }

  /**
   * @param {string} name
   * @param {Record<string, any>} conf
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  _makemodel_gltf(name, conf) {
    const sourcekey = conf["source"];
    const objectkey = conf["object"];
    const gltf = this._assets.file(sourcekey);
    if (!gltf?.scene) {
      logger.error(
        `Scene::_makemodel_gltf "${name}" error: no source "${sourcekey}" preloaded`,
      );
      return null;
    }

    const sourcemesh = gltf.scene.getObjectByName(objectkey);
    if (!sourcemesh?.isMesh) {
      logger.error(
        `Scene::_makemodel_gltf "${name}" error: no mesh "${objectkey}" in "${sourcekey}"`,
      );
      return null;
    }

    const core = this._draw.core;
    if (!core) {
      logger.error(`Scene::_makemodel_gltf drawcore not ready`);
      return null;
    }

    const geometry = sourcemesh.geometry.clone();
    const srcMaterial = sourcemesh.material;
    const material = this._get_material(conf, srcMaterial);

    if (!core.getimesh(name)) {
      core.initimesh(name, geometry, material, {
        capacity: 8,
        renderer: this._draw._render.renderer,
        castShadow: true,
        receiveShadow: false,
      }, this._draw.pivot);
      core.inituniforms(name, {
        color: "vec3",
        emissive: "vec3",
        opacity: "float",
      });
    }

    const entity = core.makemesh(name);
    if (!entity) {
      return null;
    }

    entity.setUniform("opacity", material.opacity);
    entity.setUniform(
      "emissive",
      cache.color0.copy(material.emissive ?? cache.color0.setHex(0xffffff)).multiplyScalar(material.emissiveIntensity ?? 0),
    );
    entity.setUniform("color", cache.color1.copy(material.color));

    return entity;
  }

  /**
   * @param {import("@three.ez/instanced-mesh").InstancedEntity|null} entity
   * @param {oimo.dynamics.rigidbody.RigidBody} [body]
   * @returns {void}
   */
  delmodel(entity, body) {
    if (!entity) {
      return;
    }
    // 2026-06-14, Composer: delmodel before delbody clears weld ref [scnmd2]
    if (body?.id != null && this._physics.meshlist[body.id] === entity) {
      delete this._physics.meshlist[body.id];
      delete this._physics.attachopts[body.id];
    }
    entity.remove();
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
  // 2026-06-14, Composer: snake_case scene method names [snkcs1]
  set_bodyposition(body, x, y, z) {
    this._physics.setBodyPosition(body, x, y, z);
  }

  /**
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @param {import("three").Quaternion} rotation
   * @returns {void}
   */
  // 2026-06-26, Composer: set_bodyrotation via physics [scnrot1]
  set_bodyrotation(body, rotation) {
    this._physics.setBodyRotation(body, rotation);
  }

  /**
   * @param {number} index
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  get_itementity(index) {
    const body = this.get_itembody(index);
    if (!body) {
      return null;
    }
    return this._physics.meshlist[body.id] ?? null;
  }

  /**
   * @param {number} index
   * @returns {oimo.dynamics.rigidbody.RigidBody|null}
   */
  get_itembody(index) {
    const body_id = this._itembox.mempool.read_ui16(index, VAR_BODY_ID);
    return this._physics.bodylist[body_id] ?? null;
  }

  /**
   * @param {number} index
   * @param {number|import("three").Vector3} x
   * @param {number} [y]
   * @param {number} [z]
   * @returns {void}
   */
  // 2026-06-26, Composer: set_itemposition accepts Vector3 [scnpos1]
  set_itemposition(index, x, y, z) {
    if (x != null && typeof x === "object") {
      return this.set_itemposition(index, x.x, x.y, x.z);
    }
    const body = this.get_itembody(index);
    if (!body) {
      return;
    }
    this.set_bodyposition(body, x, y, z);
  }

  /**
   * @param {number} index
   * @param {import("three").Quaternion} rotation
   * @returns {void}
   */
  // 2026-06-26, Composer: set_itemrotation via body quaternion [scnrot1]
  set_itemrotation(index, rotation) {
    const body = this.get_itembody(index);
    if (!body) {
      return;
    }
    this.set_bodyrotation(body, rotation);
  }

  /**
   * @param {number} index
   * @returns {void}
   */
  spawn_item(index) {
    // 2026-06-14, Composer: item init dispose via eventbus listeners [itmbx1]
    const conf = this._itembox.get_itemconf(index);
    if (!conf) {
      logger.error(`Scene::spawn_item error: no item conf for index ${index}`);
      return;
    }

    const body_key = conf.body;
    const mesh_key = conf.mesh;
    const body = this.makebody(body_key);
    if (!body) {
      return;
    }

    let entity = null;
    if (mesh_key) {
      entity = this.model(mesh_key);
      if (!entity) {
        this.delbody(body_key, body);
        return;
      }
      this.weldbody(body, entity, { allow_rotate: true });
    }

    // 2026-06-26, Composer: body userData itemIndex reuse existing object [scnud1]
    if (body.userData == null) {
      body.userData = {};
    }
    body.userData.itemIndex = index;
    this._itembox.mempool.write_ui16(index, VAR_BODY_ID, body.id);
  }

  /**
   * @param {number} index
   * @returns {void}
   */
  despawn_item(index) {
    const conf = this._itembox.get_itemconf(index);
    if (!conf) {
      return;
    }

    const body_id = this._itembox.mempool.read_ui16(index, VAR_BODY_ID);
    const body = this._physics.bodylist[body_id];
    const entity = body ? this._physics.meshlist[body.id] : null;

    this.delmodel(entity, body);
    if (body) {
      this.delbody(conf.body, body);
    }
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

    // 2026-06-26, Composer: bounds body from model mesh bbox [scnbnd1]
    if (bodyconf.type === "bounds") {
      if (!this._makebodyshape_bounds(bodyconf, body)) {
        return null;
      }
      body.setGravityScale(bodyconf.gravityscale ?? 1);
      return body;
    }

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
      case "cylinder":
        geometry = new oimo.collision.geometry.CylinderGeometry(
          bodyconf.r ?? 0.5,
          (bodyconf.h ?? 1) * 0.5,
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
   * @param {Record<string, any>} bodyconf
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @returns {boolean}
   */
  _makebodyshape_bounds(bodyconf, body) {
    const modelkey = bodyconf.source;
    const modelconf = this._db.get("models")?.getconfig(modelkey);
    if (!modelconf) {
      logger.error(
        `Scene::_makebodyshape_bounds error: no model "${modelkey}" declared`,
      );
      return false;
    }

    const gltf = this._assets.file(modelconf.source);
    if (!gltf?.scene) {
      logger.error(
        `Scene::_makebodyshape_bounds error: no gltf "${modelconf.source}" preloaded`,
      );
      return false;
    }

    const objectkey = modelconf.object;
    const sourceobject = gltf.scene.getObjectByName(objectkey);
    if (!sourceobject) {
      logger.error(
        `Scene::_makebodyshape_bounds error: no object "${objectkey}" in "${modelconf.source}"`,
      );
      return false;
    }

    // 2026-06-27, Composer: bounds shape matrix relative to sourceobject [scnbnd2]
    gltf.scene.updateMatrixWorld(true);
    _boundsSrcInv.copy(sourceobject.matrixWorld).invert();

    let added = false;
    sourceobject.traverse((o) => {
      /** @type {THREE.Mesh} */
      const mesh = /** @type {any} */ (o);
      if (!mesh.isMesh) {
        return;
      }

      const count = mesh.count ?? 1;
      for (let i = 0; i < count; i++) {
        if (mesh.isInstancedMesh) {
          if (this.create_instanced_mesh_shape(mesh, i, body, bodyconf, _boundsSrcInv)) {
            added = true;
          }
        } else if (this.create_mesh_shape(mesh, body, bodyconf, _boundsSrcInv)) {
          added = true;
        }
      }
    });

    return added;
  }

  /**
   * @param {THREE.InstancedMesh} mesh
   * @param {number} index
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @param {Record<string, any>} bodyconf
   * @param {THREE.Matrix4} srcInv
   * @returns {oimo.dynamics.rigidbody.Shape|null}
   */
  create_instanced_mesh_shape(mesh, index, body, bodyconf, srcInv) {
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    // 2026-06-27, Composer: bounds shape matrix relative to sourceobject [scnbnd2]
    const matrix = cache.mat4;
    mesh.getMatrixAt(index, matrix);
    matrix.premultiply(mesh.matrixWorld);
    matrix.premultiply(srcInv);

    return this.create_shape(mesh.geometry.boundingBox, matrix, body, bodyconf);
  }

  /**
   * @param {THREE.Mesh} mesh
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @param {Record<string, any>} bodyconf
   * @param {THREE.Matrix4} srcInv
   * @returns {oimo.dynamics.rigidbody.Shape|null}
   */
  create_mesh_shape(mesh, body, bodyconf, srcInv) {
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    // 2026-06-27, Composer: bounds shape matrix relative to sourceobject [scnbnd2]
    const matrix = cache.mat4.copy(mesh.matrixWorld).premultiply(srcInv);

    return this.create_shape(
      mesh.geometry.boundingBox,
      matrix,
      body,
      bodyconf,
    );
  }

  /**
   * @param {THREE.Box3} boundbox
   * @param {THREE.Matrix4} matrix
   * @param {oimo.dynamics.rigidbody.RigidBody} body
   * @param {Record<string, any>} bodyconf
   * @returns {oimo.dynamics.rigidbody.Shape|null}
   */
  create_shape(boundbox, matrix, body, bodyconf) {
    const size = boundbox.getSize(cache.vec3.v0);
    const center = boundbox.getCenter(cache.vec3.v1);
    const pos = cache.vec3.v2;
    const rot = cache.quat.q0;
    const scale = cache.vec3.v4;
    matrix.decompose(pos, rot, scale);
    pos.add(center);
    size.x *= scale.x;
    size.y *= scale.y;
    size.z *= scale.z;

    let geometry = null;
    if (bodyconf.shape === "cylinder") {
      const radius = Math.max(size.x, size.z) * 0.5;
      const halfHeight = size.y * 0.5;
      geometry = new oimo.collision.geometry.CylinderGeometry(radius, halfHeight);
    } else {
      geometry = new oimo.collision.geometry.BoxGeometry(
        this._body_cache.vec3.init(size.x * 0.5, size.y * 0.5, size.z * 0.5),
      );
    }

    const rshape_config = new oimo.dynamics.rigidbody.ShapeConfig();
    rshape_config.geometry = geometry;
    rshape_config.density = bodyconf.density ?? 1;
    rshape_config.friction = bodyconf.friction ?? 1;
    rshape_config.restitution = bodyconf.restitution ?? 0;
    const rshape = new oimo.dynamics.rigidbody.Shape(rshape_config);
    body.addShape(rshape);

    const t = this._body_cache.transform;
    const oq = this._physics.cache.quat;
    oq.x = rot.x;
    oq.y = rot.y;
    oq.z = rot.z;
    oq.w = rot.w;
    t.setPosition(this._body_cache.vec3.init(pos.x, pos.y, pos.z));
    t.setOrientation(oq);
    rshape.setLocalTransform(t);

    return rshape;
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
    // 2026-06-26, Composer: clear pooled body userData itemIndex [scnud1]
    if (body.userData != null) {
      body.userData.itemIndex = null;
    }
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
  step(dt, _rdt) {
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

    this.update_instancedbounds();
  }

  /**
   * @returns {void}
   */
  update_instancedbounds() {
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
// 2026-06-18, Composer: imesh key is model name geometry+material [mdcol1]
// 2026-06-14, Composer: pooled makebody delbody by bodies db name [scnbd1]
// 2026-06-14, Composer: scene owns body pool and physics weld [scnbd2]
// 2026-06-14, Composer: model returns entity only not wrapper [scnmd1]
// 2026-06-14, Composer: delmodel before delbody clears weld ref [scnmd2]
// 2026-06-14, Composer: scene environment floor lights csm [scnenv1]
// 2026-06-14, Composer: environment start uses config only [scnenv2]
// 2026-06-14, Composer: expose draw db getters for Ui [scnui1]
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
// 2026-06-14, Composer: wire Tyntext inline #[sprite] tokens [sprfac1]
// 2026-06-14, Composer: refresh bounds for culled instanced meshes [scnbs1]
// 2026-06-14, Composer: billboard sprites face render camera [sprfac1]
// 2026-06-14, Composer: item init dispose via eventbus listeners [itmbx1]
// 2026-06-14, Composer: item events pass index scalar [itmhp1]
// 2026-06-14, Composer: snake_case scene method names [snkcs1]
// 2026-06-17, Composer: dispose scene physics pools on teardown [crcyc4]
// 2026-06-26, Composer: set_itemposition accepts Vector3 [scnpos1]
// 2026-06-26, Composer: set_itemrotation via body quaternion [scnrot1]
// 2026-06-26, Composer: makemodel gltf source/object branch [scnglt1]
// 2026-06-26, Composer: bounds body from model mesh bbox [scnbnd1]
// 2026-06-27, Composer: bounds shape matrix relative to sourceobject [scnbnd2]
// 2026-06-26, Composer: cached ExtendedMaterial DitheredOpacity CSM [scnmat1]
// 2026-06-26, Composer: material shininess for MeshPhongMaterial [scnph1]
// 2026-06-26, Composer: scene toybox ref itembox via toybox [scntbx1]
// 2026-06-26, Composer: ContactRouter wired on item and toy events [scnctr1]
// 2026-06-26, Composer: body userData itemIndex reuse existing object [scnud1]
// 2026-06-27, Composer: scene Howler audiosprite loader [scnau1]
// 2026-06-27, Composer: load audiosprite on scene start [scnau2]
