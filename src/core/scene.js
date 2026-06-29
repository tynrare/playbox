/** @namespace ty */
import * as THREE from "three";
import logger from "../logger.js";
import { TyntextCore } from "./tyntext.js";
import { cache, v3up } from "../math.js";
import { VAR_FLAG_ACTIVE, VAR_FLAGS_A } from "./mempool.js";
import { DitheredOpacity } from "../render/materials/DitheredOpacity.js";
import { ExtendedMaterial } from "../render/materials/ExtendedMaterial.js";
import {
  MeshSpritesheetMaterial,
  SpriteMaterialExtension,
} from "../render/materials/sprite.js";
import Environment from "../scene/environment.js";
import Audio from "../scene/audio.js";
import ContactRouter from "../scene/contact_router.js";
import RigidModel, { RigidModelPart } from "../scene/rigid_model.js";
import { VAR_FLAGS_MODULES, VAR_MFLAG_CONTACTS, VAR_MFLAG_WELDS } from "../scene/modulebox.js";
import { VAR_BODY_ID, VAR_TOY_INDEX, TOY_INDEX_INVALID } from "../scene/itembox.js";
import { RAPIER } from "./physics.js";

const _billboardMatrix = new THREE.Matrix4();
const _boundsSrcInv = new THREE.Matrix4();
const _rigidRootInv = new THREE.Matrix4();
const _rigidLocalMat = new THREE.Matrix4();
const _weldParentMat = new THREE.Matrix4();
const _weldChildMat = new THREE.Matrix4();
const _weldPos = new THREE.Vector3();
const _weldQuat = new THREE.Quaternion();
const _weldScale = new THREE.Vector3();
const _weldBodyQuat = new THREE.Quaternion();

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
    /** @type {Record<string, import("@dimforge/rapier3d").RigidBody[]>} */
    this._body_pool = {};
    this._body_cache = {
      vec3: { x: 0, y: 0, z: 0 },
    };
    /** @type {Record<string, THREE.Material>} */
    this._cache_materials = {};
    /** @type {Set<RigidModel>} */
    this._rigid_models = new Set();
    /** @type {WeakMap<THREE.Object3D, RigidModel>} */
    this._rigid_by_root = new WeakMap();
    /** @type {Record<string, RigidModel[]>} */
    this._rigid_model_pool = {};
    /** @type {THREE.Mesh[]} */
    this._collect_meshes_buf = [];
    /** @type {Set<string>} */
    this._collect_meshes_seen = new Set();
    /** @type {Map<number, { joints: import("@dimforge/rapier3d").ImpulseJoint[], childIndices: number[], childKeys: string[] }>} */
    this._weld_joints = new Map();
    /** @type {Set<number>} */
    this._weld_spawned = new Set();
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
      // 2026-06-28, Composer: scene welds children on root toy.initialize [scnwld1]
      this._on_toy_initialize_welds(toyIndex);
    });
    this._on_toy_dis = this._eventsbus.on("toy.dispose", (toyIndex) => {
      this._contact_router?.unwatch(toyIndex);
      this._on_toy_dispose_welds(toyIndex);
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
    this._weld_joints.clear();
    this._weld_spawned.clear();
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
    // 2026-06-27, Composer: models db parts triggers RigidModel [rgmd2]
    if (conf.parts != null && conf["source"] && conf["object"]) {
      return this._makemodel_rigid(name, conf);
    }
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
   * @param {string} partsFilter
   * @param {string} slot
   * @returns {boolean}
   */
  _matches_parts_filter(partsFilter, slot) {
    if (partsFilter === "*") {
      return true;
    }
    if (Array.isArray(partsFilter)) {
      return partsFilter.includes(slot);
    }
    return false;
  }

  /**
   * @param {THREE.Object3D} sourceobject
   * @param {string|string[]|undefined} partsFilter
   * @returns {THREE.Mesh[]}
   */
  // 2026-06-27, Composer: traverse-only collect dedupes self-mesh objects [rgmd7]
  _collect_meshes(sourceobject, partsFilter) {
    // 2026-06-27, Composer: reuse scratch buf for makemodel collect [rgmd9]
    const meshes = this._collect_meshes_buf;
    meshes.length = 0;
    const seen = this._collect_meshes_seen;
    seen.clear();
    sourceobject.traverse((o) => {
      /** @type {THREE.Mesh} */
      const mesh = /** @type {any} */ (o);
      if (!mesh.isMesh || seen.has(mesh.uuid)) {
        return;
      }
      seen.add(mesh.uuid);
      const slot = mesh.name || `mesh_${meshes.length}`;
      if (this._matches_parts_filter(partsFilter ?? "*", slot)) {
        meshes.push(mesh);
      }
    });
    return meshes;
  }

  /**
   * @param {import("@three.ez/instanced-mesh").InstancedEntity} entity
   * @param {THREE.Material} material
   * @returns {void}
   */
  _apply_gltf_entity_uniforms(entity, material) {
    entity.setUniform("opacity", material.opacity);
    entity.setUniform(
      "emissive",
      cache.color0
        .copy(material.emissive ?? cache.color0.setHex(0xffffff))
        .multiplyScalar(material.emissiveIntensity ?? 0),
    );
    entity.setUniform("color", cache.color1.copy(material.color));
  }

  /**
   * @param {string} modelName
   * @param {string} slot
   * @param {THREE.Mesh} sourcemesh
   * @param {Record<string, any>} conf
   * @returns {import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  _init_rigid_part_entity(modelName, slot, sourcemesh, conf) {
    const core = this._draw.core;
    if (!core) {
      return null;
    }

    const partKey = `${modelName}__${slot}`;
    const geometry = sourcemesh.geometry.clone();
    const srcMaterial = sourcemesh.material;
    const material = this._get_material(conf, srcMaterial);

    if (!core.getimesh(partKey)) {
      core.initimesh(
        partKey,
        geometry,
        material,
        {
          capacity: 8,
          renderer: this._draw._render.renderer,
          castShadow: true,
          receiveShadow: false,
        },
        this._draw.pivot,
      );
      core.inituniforms(partKey, {
        color: "vec3",
        emissive: "vec3",
        opacity: "float",
      });
    }

    const entity = core.makemesh(partKey);
    if (!entity) {
      return null;
    }
    this._apply_gltf_entity_uniforms(entity, material);
    return entity;
  }

  /**
   * @param {string} name
   * @param {Record<string, any>} conf
   * @returns {RigidModel|null}
   */
  _makemodel_rigid(name, conf) {
    const sourcekey = conf["source"];
    const objectkey = conf["object"];
    const gltf = this._assets.file(sourcekey);
    if (!gltf?.scene) {
      logger.error(
        `Scene::_makemodel_rigid "${name}" error: no source "${sourcekey}" preloaded`,
      );
      return null;
    }

    const sourceobject = gltf.scene.getObjectByName(objectkey);
    if (!sourceobject) {
      logger.error(
        `Scene::_makemodel_rigid "${name}" error: no object "${objectkey}" in "${sourcekey}"`,
      );
      return null;
    }

    const meshes = this._collect_meshes(sourceobject, conf.parts);
    if (!meshes.length) {
      logger.error(
        `Scene::_makemodel_rigid "${name}" error: no meshes matched parts filter`,
      );
      return null;
    }

    let pool = this._rigid_model_pool[name];
    if (!pool) {
      this._rigid_model_pool[name] = pool = [];
    }
    let model = pool.pop();
    if (!model) {
      model = new RigidModel();
    }
    model.modelKey = name;
    // 2026-06-27, Composer: clear pooled root children before rebuild [rgmd8]
    model.root.clear();
    this._draw.pivot.add(model.root);

    gltf.scene.updateMatrixWorld(true);
    _rigidRootInv.copy(sourceobject.matrixWorld).invert();

    for (let i = 0, n = meshes.length; i < n; i++) {
      const sourcemesh = meshes[i];
      const slot = sourcemesh.name || `mesh_${model.parts.size}`;
      const entity = this._init_rigid_part_entity(name, slot, sourcemesh, conf);
      if (!entity) {
        this._release_rigid_model(model);
        return null;
      }

      const part = RigidModelPart.acquire(entity);
      part.pivot.name = slot;
      _rigidLocalMat.copy(sourcemesh.matrixWorld).premultiply(_rigidRootInv);
      part.pivot.matrix.copy(_rigidLocalMat);
      part.pivot.matrix.decompose(
        part.pivot.position,
        part.pivot.quaternion,
        part.pivot.scale,
      );
      part.pivot.updateMatrix();
      model.root.add(part.pivot);
      model.parts.set(slot, part);
    }

    model.sync();
    return model;
  }

  /**
   * @param {RigidModel} model
   * @returns {void}
   */
  _release_rigid_model(model) {
    this._rigid_models.delete(model);
    this._rigid_by_root.delete(model.root);
    model.release();
    const key = model.modelKey;
    if (!key) {
      return;
    }
    if (!this._rigid_model_pool[key]) {
      this._rigid_model_pool[key] = [];
    }
    this._rigid_model_pool[key].push(model);
  }

  /**
   * @param {import("@three.ez/instanced-mesh").InstancedEntity|THREE.Object3D|null} entity
   * @param {import("@dimforge/rapier3d").RigidBody} [body]
   * @returns {void}
   */
  delmodel(entity, body) {
    if (!entity) {
      return;
    }

    const rigid = this._rigid_by_root.get(entity);
    if (rigid) {
      // 2026-06-27, Composer: rigid despawn releases part entities [rgmd3]
      if (body?.id != null && this._physics.meshlist[body.id] === entity) {
        delete this._physics.meshlist[body.id];
        delete this._physics.attachopts[body.id];
      }
      this._release_rigid_model(rigid);
      return;
    }

    // 2026-06-14, Composer: delmodel before delbody clears weld ref [scnmd2]
    if (body?.id != null && this._physics.meshlist[body.id] === entity) {
      delete this._physics.meshlist[body.id];
      delete this._physics.attachopts[body.id];
    }
    if (/** @type {any} */ (entity).isInstanceEntity) {
      /** @type {import("@three.ez/instanced-mesh").InstancedEntity} */ (entity).remove();
    }
  }

  /**
   * @param {string} name bodies db key
   * @returns {import("@dimforge/rapier3d").RigidBody|null}
   */
  makebody(name) {
    // 2026-06-29, Composer: Rapier bodies recreated each makebody [scnrbd1]
    const body = this._create_body(name);
    if (!body) {
      return null;
    }
    this._physics.addBody(body);
    return body;
  }

  /**
   * @param {string} name bodies db key
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @returns {void}
   */
  delbody(name, body) {
    if (!body) {
      return;
    }
    this._physics.remove(body);
  }

  /**
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @param {import("@three.ez/instanced-mesh").InstancedEntity} entity
   * @param {object} [opts]
   * @returns {void}
   */
  weldbody(body, entity, opts) {
    this._physics.weld(body, entity, opts);
  }

  /**
   * @param {import("@dimforge/rapier3d").RigidBody} body
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
   * @param {import("@dimforge/rapier3d").RigidBody} body
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
   * @returns {RigidModel|import("@three.ez/instanced-mesh").InstancedEntity|null}
   */
  get_itemmodel(index) {
    const body = this.get_itembody(index);
    if (!body) {
      return null;
    }
    const welded = this._physics.meshlist[body.id];
    if (!welded) {
      return null;
    }
    return this._rigid_by_root.get(welded) ?? welded ?? null;
  }

  /**
   * @param {number} index
   * @returns {import("@dimforge/rapier3d").RigidBody|null}
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
    this._maybe_sync_weld_members_for_item(index);
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
    this._maybe_sync_weld_members_for_item(index);
  }

  /**
   * @param {number} index
   * @param {THREE.Matrix4} worldMat
   * @returns {void}
   */
  // 2026-06-28, Composer: set item body pose from world matrix [scnwld3]
  set_item_world_matrix(index, worldMat) {
    const body = this.get_itembody(index);
    if (!body) {
      return;
    }
    this._set_body_world_matrix(body, worldMat);
    this._maybe_sync_weld_members_for_item(index);
  }

  /**
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @param {THREE.Matrix4} worldMat
   * @returns {void}
   */
  _set_body_world_matrix(body, worldMat) {
    worldMat.decompose(_weldPos, _weldQuat, _weldScale);
    body.setTranslation({ x: _weldPos.x, y: _weldPos.y, z: _weldPos.z }, true);
    body.setRotation(
      { x: _weldQuat.x, y: _weldQuat.y, z: _weldQuat.z, w: _weldQuat.w },
      true,
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this._physics.step_attach(body.id);
    const rigid = this._rigid_by_root.get(this._physics.meshlist[body.id]);
    rigid?.sync();
  }

  /**
   * @param {number} itemIndex
   * @returns {void}
   */
  _maybe_sync_weld_members_for_item(itemIndex) {
    const toyIndex = this._itembox.mempool.read_ui16(itemIndex, VAR_TOY_INDEX);
    if (toyIndex === TOY_INDEX_INVALID) {
      return;
    }
    if (!this._toybox.modulebox.welds.is_root(toyIndex)) {
      return;
    }
    if (!this._weld_spawned.has(toyIndex)) {
      return;
    }
    this._sync_weld_subtree(toyIndex);
  }

  /**
   * @param {number} toyIndex
   * @returns {void}
   */
  // 2026-06-28, Composer: recursive weld subtree sync from parent pose [scnwld6]
  _sync_weld_subtree(toyIndex) {
    const welds = this._toybox.modulebox.welds;
    if (!welds.is_root(toyIndex)) {
      return;
    }
    const pack = this._weld_joints.get(toyIndex);
    if (!pack?.childKeys?.length) {
      return;
    }
    const parentItem = this._toybox.get_item_index(toyIndex);
    const parentBody = this.get_itembody(parentItem);
    if (!parentBody) {
      return;
    }
    const parentConf = this._toybox.get_toyconf(toyIndex);
    const parentModel = parentConf?.item
      ? this._db.get("models")?.getconfig(
          this._itembox.get_itemconf_by_key(parentConf.item)?.mesh,
        )
      : null;
    if (!parentModel?.source || !parentModel?.object) {
      return;
    }
    if (!this._body_world_matrix(parentBody, _weldParentMat)) {
      return;
    }

    const anchor = this._physics.cache.vec3_3;
    for (let i = 0, n = pack.childKeys.length; i < n; i++) {
      const childKey = pack.childKeys[i];
      const childIndex = pack.childIndices[i];
      const childModel = this._resolve_toy_mesh_model(childKey);
      if (!childModel?.source || !childModel?.object) {
        continue;
      }
      const relMat = this.get_gltf_child_transform(
        parentModel.source,
        parentModel.object,
        childModel.object,
      );
      if (!relMat) {
        continue;
      }
      const childItem = this._toybox.get_item_index(childIndex);
      const childBody = this.get_itembody(childItem);
      if (!childBody) {
        continue;
      }

      if (pack.joints[i]) {
        this._physics.remove_joint(pack.joints[i]);
      }

      _weldChildMat.copy(_weldParentMat).multiply(relMat);
      this._set_body_world_matrix(childBody, _weldChildMat);

      const anchor = this._physics.cache.vec3_3;
      const childPos = childBody.translation();
      anchor.x = childPos.x;
      anchor.y = childPos.y;
      anchor.z = childPos.z;
      pack.joints[i] = this._physics.create_fixed_joint(parentBody, childBody, anchor);

      this._sync_weld_subtree(childIndex);
    }
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
      // 2026-06-27, Composer: weld RigidModel root and track for sync [rgmd4]
      if (/** @type {any} */ (entity).isRigidModel) {
        const rigid = /** @type {RigidModel} */ (entity);
        this.weldbody(body, rigid.root, { allow_rotate: true });
        this._rigid_models.add(rigid);
        this._rigid_by_root.set(rigid.root, rigid);
        rigid.sync();
      } else {
        this.weldbody(body, entity, { allow_rotate: true });
      }
    }

    // 2026-06-26, Composer: body userData itemIndex reuse existing object [scnud1]
    if (body.userData == null) {
      body.userData = {};
    }
    body.userData.itemIndex = index;
    this._physics.set_body_meta(body.id, { itemIndex: index });
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
   * @returns {import("@dimforge/rapier3d").RigidBody|null}
   */
  _create_body(name) {
    const bodyconf = this._db.get("bodies")?.getconfig(name);
    if (!bodyconf) {
      logger.error(`Scene::_create_body error: no body "${name}" declared`);
      return null;
    }

    const world = this._physics.world;
    // 2026-06-29, Composer: guard _create_body when Rapier not loaded [rphdyn1]
    if (!RAPIER || !world) {
      return null;
    }

    // 2026-06-29, Composer: scene bodies via RigidBodyDesc ColliderDesc [scnrbd2]
    const desc = bodyconf.dynamics
      ? RAPIER.RigidBodyDesc.dynamic()
      : RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(0, 1, 0);
    desc.setAngularDamping(bodyconf.adamping ?? 1);
    desc.setLinearDamping(bodyconf.ldamping ?? 1);
    desc.setGravityScale(bodyconf.gravityscale ?? 1);
    const body = world.createRigidBody(desc);

    if (bodyconf.type === "bounds") {
      if (!this._makebodyshape_bounds(bodyconf, body)) {
        world.removeRigidBody(body);
        return null;
      }
      return body;
    }

    let colDesc = null;
    switch (bodyconf.shape) {
      case "box":
        colDesc = RAPIER.ColliderDesc.cuboid(
          (bodyconf.w ?? 1) * 0.5,
          (bodyconf.h ?? 1) * 0.5,
          (bodyconf.l ?? 1) * 0.5,
        );
        break;
      case "cylinder":
        colDesc = RAPIER.ColliderDesc.cylinder(
          (bodyconf.h ?? 1) * 0.5,
          bodyconf.r ?? 0.5,
        );
        break;
      default:
        logger.error(
          `Scene::_create_body error: unsupported shape "${bodyconf.shape}"`,
        );
        world.removeRigidBody(body);
        return null;
    }

    if (colDesc) {
      colDesc
        .setDensity(bodyconf.density ?? 1)
        .setFriction(bodyconf.friction ?? 1)
        .setRestitution(bodyconf.restitution ?? 0);
      world.createCollider(colDesc, body);
    }

    return body;
  }

  /**
   * @param {Record<string, any>} bodyconf
   * @param {import("@dimforge/rapier3d").RigidBody} body
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
    const partsFilter = bodyconf.parts;
    if (partsFilter != null) {
      // 2026-06-28, Composer: bounds body respects parts filter like mesh [scnbnd3]
      const meshes = this._collect_meshes(sourceobject, partsFilter);
      for (let i = 0, n = meshes.length; i < n; i++) {
        const mesh = meshes[i];
        const count = mesh.count ?? 1;
        for (let j = 0; j < count; j++) {
          if (mesh.isInstancedMesh) {
            if (this.create_instanced_mesh_shape(mesh, j, body, bodyconf, _boundsSrcInv)) {
              added = true;
            }
          } else if (this.create_mesh_shape(mesh, body, bodyconf, _boundsSrcInv)) {
            added = true;
          }
        }
      }
      return added;
    }

    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {THREE.Object3D} */
    const visitShape = (o) => {
      /** @type {THREE.Mesh} */
      const mesh = /** @type {any} */ (o);
      if (!mesh.isMesh || seen.has(mesh.uuid)) {
        return;
      }
      seen.add(mesh.uuid);

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
    };
    sourceobject.traverse(visitShape);

    return added;
  }

  /**
   * @param {THREE.InstancedMesh} mesh
   * @param {number} index
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @param {Record<string, any>} bodyconf
   * @param {THREE.Matrix4} srcInv
   * @returns {import("@dimforge/rapier3d").Collider|null}
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
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @param {Record<string, any>} bodyconf
   * @param {THREE.Matrix4} srcInv
   * @returns {import("@dimforge/rapier3d").Collider|null}
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
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @param {Record<string, any>} bodyconf
   * @returns {import("@dimforge/rapier3d").Collider|null}
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

    let colDesc = null;
    if (bodyconf.shape === "cylinder") {
      const radius = Math.max(size.x, size.z) * 0.5;
      const halfHeight = size.y * 0.5;
      colDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius);
    } else {
      colDesc = RAPIER.ColliderDesc.cuboid(
        size.x * 0.5,
        size.y * 0.5,
        size.z * 0.5,
      );
    }

    colDesc
      .setDensity(bodyconf.density ?? 1)
      .setFriction(bodyconf.friction ?? 1)
      .setRestitution(bodyconf.restitution ?? 0)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });

    return this._physics.world.createCollider(colDesc, body);
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
   * @param {string} toyKey
   * @returns {Record<string, any>|null}
   */
  _resolve_toy_mesh_model(toyKey) {
    const toyconf = this._db.get("toys")?.getconfig(toyKey);
    if (!toyconf?.item) {
      return null;
    }
    const itemconf = this._itembox.get_itemconf_by_key(toyconf.item);
    if (!itemconf?.mesh) {
      return null;
    }
    return this._db.get("models")?.getconfig(itemconf.mesh) ?? null;
  }

  /**
   * @param {string} sourceKey
   * @param {string} parentObjectKey
   * @param {string} childObjectKey
   * @returns {THREE.Matrix4|null}
   */
  get_gltf_child_transform(sourceKey, parentObjectKey, childObjectKey) {
    const gltf = this._assets.file(sourceKey);
    if (!gltf?.scene) {
      logger.error(
        `Scene::get_gltf_child_transform error: no source "${sourceKey}" preloaded`,
      );
      return null;
    }
    gltf.scene.updateMatrixWorld(true);
    const parent = gltf.scene.getObjectByName(parentObjectKey);
    const child = gltf.scene.getObjectByName(childObjectKey);
    if (!parent || !child) {
      logger.error(
        `Scene::get_gltf_child_transform error: missing "${parentObjectKey}" or "${childObjectKey}"`,
      );
      return null;
    }
    _rigidLocalMat.copy(child.matrixWorld).premultiply(
      _rigidRootInv.copy(parent.matrixWorld).invert(),
    );
    return _rigidLocalMat;
  }

  /**
   * @param {import("@dimforge/rapier3d").RigidBody} body
   * @param {THREE.Matrix4} out
   * @returns {THREE.Matrix4|null}
   */
  _body_world_matrix(body, out) {
    if (!body) {
      return null;
    }
    const p = body.translation();
    const q = body.rotation();
    _weldPos.set(p.x, p.y, p.z);
    _weldBodyQuat.set(q.x, q.y, q.z, q.w);
    return out.compose(_weldPos, _weldBodyQuat, _weldScale.set(1, 1, 1));
  }

  /**
   * @param {number} toyIndex
   * @returns {void}
   */
  _on_toy_initialize_welds(toyIndex) {
    if (this._weld_spawned.has(toyIndex)) {
      return;
    }
    const mempool = this._toybox.mempool;
    if (!mempool.read_flag(toyIndex, VAR_FLAGS_MODULES, VAR_MFLAG_WELDS)) {
      return;
    }
    const conf = this._toybox.get_toyconf(toyIndex);
    if (!conf?.welds?.length) {
      return;
    }
    this._weld_children(toyIndex, conf.welds);
  }

  /**
   * @param {number} rootIndex
   * @param {string[]} childKeys
   * @returns {void}
   */
  _weld_children(rootIndex, childKeys) {
    // 2026-06-28, Composer: scene spawn weld children on root init [scnwld2]
    const rootItem = this._toybox.get_item_index(rootIndex);
    const rootBody = this.get_itembody(rootItem);
    if (!rootBody) {
      logger.error(`Scene::_weld_children error: no root body for toy ${rootIndex}`);
      return;
    }
    const rootConf = this._toybox.get_toyconf(rootIndex);
    const rootModel = rootConf?.item
      ? this._db.get("models")?.getconfig(
          this._itembox.get_itemconf_by_key(rootConf.item)?.mesh,
        )
      : null;
    if (!rootModel?.source || !rootModel?.object) {
      logger.error(`Scene::_weld_children error: no root mesh model for toy ${rootIndex}`);
      return;
    }
    if (!this._body_world_matrix(rootBody, _weldParentMat)) {
      return;
    }

    /** @type {import("@dimforge/rapier3d").ImpulseJoint[]} */
    const joints = [];
    /** @type {number[]} */
    const childIndices = [];
    /** @type {string[]} */
    const childKeysStored = [];
    const welds = this._toybox.modulebox.welds;
    const anchor = this._physics.cache.vec3_3;

    for (let i = 0, n = childKeys.length; i < n; i++) {
      const childKey = childKeys[i];
      const childModel = this._resolve_toy_mesh_model(childKey);
      if (!childModel?.source || !childModel?.object) {
        logger.error(`Scene::_weld_children error: no model for "${childKey}"`);
        continue;
      }
      const relMat = this.get_gltf_child_transform(
        rootModel.source,
        rootModel.object,
        childModel.object,
      );
      if (!relMat) {
        continue;
      }

      const childIndex = this._toybox.spawn(childKey, false);
      if (childIndex == null) {
        continue;
      }
      this._toybox.enable_module(childIndex, "welds");
      this._toybox.modulebox.configure(childIndex, { weld_root: rootIndex });

      const childItem = this._toybox.get_item_index(childIndex);
      this._itembox.itemupdate(0, childItem);

      _weldChildMat.copy(_weldParentMat).multiply(relMat);
      this.set_item_world_matrix(childItem, _weldChildMat);
      this._toybox.toyupdate(0, childIndex);

      const childBody = this.get_itembody(childItem);
      if (!childBody) {
        this._toybox.despawn(childIndex, true);
        continue;
      }

      const childPos = childBody.translation();
      anchor.x = childPos.x;
      anchor.y = childPos.y;
      anchor.z = childPos.z;
      const joint = this._physics.create_fixed_joint(rootBody, childBody, anchor);
      if (joint) {
        joints.push(joint);
      }
      welds.push_member(rootIndex, childIndex);
      childIndices.push(childIndex);
      childKeysStored.push(childKey);
    }

    this._weld_joints.set(rootIndex, {
      joints,
      childIndices,
      childKeys: childKeysStored,
    });
    this._weld_spawned.add(rootIndex);
  }

  /**
   * @param {number} rootIndex
   * @param {number} childIndex
   * @returns {void}
   */
  unweld_member(rootIndex, childIndex) {
    const pack = this._weld_joints.get(rootIndex);
    if (!pack) {
      return;
    }
    const i = pack.childIndices.indexOf(childIndex);
    if (i < 0) {
      return;
    }
    const joint = pack.joints[i];
    if (joint) {
      this._physics.remove_joint(joint);
      pack.joints.splice(i, 1);
    }
    pack.childIndices.splice(i, 1);
    pack.childKeys?.splice(i, 1);
  }

  /**
   * @param {number} toyIndex
   * @returns {void}
   */
  _on_toy_dispose_welds(toyIndex) {
    // 2026-06-28, Composer: scene weld dispose joints only welds owns cascade [scnwld5]
    const pack = this._weld_joints.get(toyIndex);
    if (pack) {
      for (const joint of pack.joints) {
        this._physics.remove_joint(joint);
      }
      this._weld_joints.delete(toyIndex);
      this._weld_spawned.delete(toyIndex);
    }
    const welds = this._toybox.modulebox.welds;
    if (!welds.has(toyIndex) || !welds.is_member(toyIndex)) {
      return;
    }
    const parent = welds.get_parent(toyIndex);
    if (parent !== TOY_INDEX_INVALID) {
      this.unweld_member(parent, toyIndex);
    }
  }

  /**
   * @returns {void}
   */
  sync_rigid_models() {
    for (const model of this._rigid_models) {
      model.sync();
    }
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  step(dt, _rdt) {
    // 2026-06-27, Composer: rigid part sync after physics step_attach [rgmd5]
    this.sync_rigid_models();
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
// 2026-06-27, Composer: models db parts triggers RigidModel [rgmd2]
// 2026-06-27, Composer: rigid despawn releases part entities [rgmd3]
// 2026-06-27, Composer: weld RigidModel root and track for sync [rgmd4]
// 2026-06-27, Composer: rigid part sync after physics step_attach [rgmd5]
// 2026-06-27, Composer: reuse scratch buf for makemodel collect [rgmd9]
// 2026-06-28, Composer: scene welds children on root toy.initialize [scnwld1]
// 2026-06-28, Composer: scene spawn weld children on root init [scnwld2]
// 2026-06-28, Composer: bounds body respects parts filter like mesh [scnbnd3]
// 2026-06-28, Composer: set item body pose from world matrix [scnwld3]
// 2026-06-28, Composer: reposition welded children from root body pose [scnwld4]
// 2026-06-28, Composer: scene weld dispose joints only welds owns cascade [scnwld5]
// 2026-06-28, Composer: recursive weld subtree sync from parent pose [scnwld6]
// 2026-06-29, Composer: Rapier bodies recreated each makebody [scnrbd1]
// 2026-06-29, Composer: scene bodies via RigidBodyDesc ColliderDesc [scnrbd2]
// 2026-06-29, Composer: guard _create_body when Rapier not loaded [rphdyn1]
