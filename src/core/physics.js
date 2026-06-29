/** @namespace ty */
// 2026-06-29, Composer: Rapier physics world owner and step loop [rph1]
import * as THREE from "three";
import { cache } from "../math.js";
// 2026-06-29, Composer: dynamic import rapier3d deferred to bootstrap [rphdyn1]
/** @type {typeof import("@dimforge/rapier3d").default | null} */
let RAPIER = null;
/** @type {Promise<typeof import("@dimforge/rapier3d").default> | null} */
let _rapierLoad = null;

/**
 * @returns {Promise<typeof import("@dimforge/rapier3d").default>}
 */
function ensureRapier() {
	if (RAPIER) {
		return Promise.resolve(RAPIER);
	}
	if (!_rapierLoad) {
		_rapierLoad = import("@dimforge/rapier3d").then((mod) => {
			RAPIER = mod.default;
			return RAPIER;
		});
	}
	return _rapierLoad;
}

import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

const SOLVER_ITERATIONS = 10;
const SOLVER_FRICTION_ITERATIONS = 5;
const SOLVER_ALLOWED_LINEAR_ERROR = 0.005;

const DEFAULT_CONFIG = {
	ref_dt: 0.008,
	debug: false,
};

const _IDENTITY_ROT = { w: 1, x: 0, y: 0, z: 0 };
const _worldQuat = new THREE.Quaternion();
const _localVec = new THREE.Vector3();

/**
 * @param {{ x: number, y: number, z: number }} world
 * @param {{ x: number, y: number, z: number }} bodyPos
 * @param {{ x: number, y: number, z: number, w: number }} bodyRot
 * @returns {{ x: number, y: number, z: number }}
 */
function world_to_local_point(world, bodyPos, bodyRot) {
	_worldQuat.set(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w);
	_localVec.set(world.x - bodyPos.x, world.y - bodyPos.y, world.z - bodyPos.z);
	_localVec.applyQuaternion(_worldQuat.invert());
	return { x: _localVec.x, y: _localVec.y, z: _localVec.z };
}

/**
 * @class RapierDebugDraw
 * @memberof pb.core
 */
class RapierDebugDraw {
	/**
	 * @param {THREE.Scene} scene
	 */
	constructor(scene) {
		// 2026-06-29, Composer: Rapier debugRender line segments [rphdb1]
		this._scene = scene;
		const lineMaterial = new LineMaterial({
			color: 0xffffff,
			vertexColors: true,
			linewidth: 4,
			alphaToCoverage: true,
		});
		this.lineMaterial = lineMaterial;
		this._geometry = new LineSegmentsGeometry();
		this._lines = new LineSegments2(this._geometry, lineMaterial);
		this._scene.add(this._lines);
	}

	/**
	 * @param {import("@dimforge/rapier3d").DebugRenderBuffers} buffers
	 * @returns {void}
	 */
	update(buffers) {
		const verts = buffers.vertices;
		const colors = buffers.colors;
		const linePositions = new Float32Array(verts.length);
		const lineColors = new Float32Array((colors.length / 4) * 3);
		for (let i = 0; i < verts.length; i++) {
			linePositions[i] = verts[i];
		}
		for (let i = 0, j = 0; i < colors.length; i += 4, j += 3) {
			lineColors[j] = colors[i];
			lineColors[j + 1] = colors[i + 1];
			lineColors[j + 2] = colors[i + 2];
		}
		this._geometry.setPositions(linePositions);
		this._geometry.setColors(lineColors);
	}

	dispose() {
		this._lines?.removeFromParent();
		this._geometry?.dispose();
		this.lineMaterial?.dispose();
		this._lines = null;
		this._geometry = null;
	}
}

/**
 * @class PhysicsUtils
 * @memberof pb.core
 */
class PhysicsUtils {
	/**
	 * @param {Physics} physics
	 * @param {THREE.Scene} scene
	 */
	constructor(physics, scene) {
		this._physics = physics;
		this._scene = scene;
	}

	/**
	 * @param {THREE.Vector3} pos
	 * @param {THREE.Vector3} size
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {number} [color]
	 * @returns {number}
	 */
	create_physics_box(pos, size, type, opts, color = 0xffffff) {
		const body = this._physics.create_box(pos, size, type, opts);
		if (!body) {
			return 0;
		}
		const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
		const material = new THREE.MeshStandardMaterial({ color });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		this._scene.add(mesh);
		this._physics.attach(body, mesh);
		return body.id;
	}

	/**
	 * @param {THREE.Vector3} pos
	 * @param {number} radius
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {number} [color]
	 * @returns {number}
	 */
	create_physics_sphere(pos, radius, type, opts, color = 0xffffff) {
		const body = this._physics.create_sphere(pos, radius, type, opts);
		if (!body) {
			return 0;
		}
		const geometry = opts?.icosphere
			? new THREE.IcosahedronGeometry(radius)
			: new THREE.SphereGeometry(radius);
		const material = new THREE.MeshStandardMaterial({ color });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		this._scene.add(mesh);
		this._physics.attach(body, mesh);
		return body.id;
	}

	/**
	 * @param {THREE.Vector3} pos
	 * @param {THREE.Vector3} size
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {number} [color]
	 * @returns {number}
	 */
	create_physics_cylinder(pos, size, type, opts, color = 0xffffff) {
		const body = this._physics.create_cylinder(pos, size, type, opts);
		if (!body) {
			return 0;
		}
		const geometry = new THREE.CylinderGeometry(
			size.x,
			size.x,
			size.y,
			opts?.sides ?? 6,
		);
		const material = new THREE.MeshStandardMaterial({ color });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		this._scene.add(mesh);
		this._physics.attach(body, mesh);
		return body.id;
	}
}

/**
 * @class Physics
 * @memberof pb.core
 */
class Physics {
	/**
	 * @param {import("./render.js").default} render
	 * @param {typeof DEFAULT_CONFIG} [config]
	 */
	constructor(render, config = DEFAULT_CONFIG) {
		this._render = render;
		this.config = config;
		this.tds = 1;
		this._acc = 0;
		/** @type {import("@dimforge/rapier3d").World|null} */
		this.world = null;
		/** @type {import("@dimforge/rapier3d").EventQueue|null} */
		this.eventQueue = null;
		/** @type {RapierDebugDraw|null} */
		this.debug_draw = null;
		/** @type {Object<string, import("@dimforge/rapier3d").RigidBody>} */
		this.bodylist = {};
		/** @type {Object<string, { itemIndex?: number|null }>} */
		this.bodyMeta = {};
		/** @type {Object<string, import("@dimforge/rapier3d").Collider>} */
		this.colliderlist = {};
		/** @type {Map<number, string>} */
		this.colliderToGameId = new Map();
		/** @type {Object<string, THREE.Object3D>} */
		this.meshlist = {};
		/** @type {Object<string, { shift?: THREE.Vector3, allow_rotate?: boolean, allow_translate?: boolean }>} */
		this.attachopts = {};
		this.cache = {
			vec3_0: { x: 0, y: 0, z: 0 },
			vec3_1: { x: 0, y: 0, z: 0 },
			vec3_2: { x: 0, y: 0, z: 0 },
			vec3_3: { x: 0, y: 0, z: 0 },
			quat: { x: 0, y: 0, z: 0, w: 1 },
		};
		this.guids = 0;
		/** @type {import("@dimforge/rapier3d").ImpulseJoint[]} */
		this._fixed_joints = [];
		/** @type {((started: boolean, h1: number, h2: number) => void)|null} */
		this._collision_handler = null;
	}

	/**
	 * @returns {Physics}
	 */
	init() {
		return this;
	}

	/**
	 * @returns {Physics}
	 */
	// 2026-06-29, Composer: sync start empty until bootstrap loads Rapier [rphdyn1]
	start() {
		this.guids = 0;
		this._acc = 0;
		if (!this.utils) {
			this.utils = new PhysicsUtils(this, this._render.scene);
		}
		this._startWorld();
		return this;
	}

	/**
	 * @returns {Promise<Physics>}
	 */
	async bootstrap() {
		await ensureRapier();
		this._startWorld();
		return this;
	}

	/** @returns {void} */
	_startWorld() {
		if (!RAPIER || this.world) {
			return;
		}
		this.world = new RAPIER.World({ x: 0, y: -9.8, z: 0 });
		this.eventQueue = new RAPIER.EventQueue(false);
		const ip = this.world.integrationParameters;
		ip.dt = this.config.ref_dt * this.tds;
		ip.numSolverIterations = SOLVER_ITERATIONS;
		ip.numAdditionalFrictionIterations = SOLVER_FRICTION_ITERATIONS;
		ip.normalizedAllowedLinearError = SOLVER_ALLOWED_LINEAR_ERROR;
		this.sync_debug_draw(this.config.debug);
	}

	/**
	 * @returns {Promise<typeof import("@dimforge/rapier3d").default>}
	 */
	ensureRapier() {
		return ensureRapier();
	}

	stop() {
		this.sync_debug_draw(false);
		for (const k in this.bodylist) {
			this.remove(this.bodylist[k]);
		}
		this.eventQueue?.free();
		this.eventQueue = null;
		this.world?.free();
		this.world = null;
		this.bodylist = {};
		this.bodyMeta = {};
		this.colliderlist = {};
		this.colliderToGameId.clear();
		this.meshlist = {};
		this.attachopts = {};
		this._fixed_joints = [];
		this._collision_handler = null;
		this._acc = 0;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @param {(started: boolean, h1: number, h2: number) => void|null} handler
	 * @returns {void}
	 */
	set_collision_handler(handler) {
		this._collision_handler = handler;
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 * @param {boolean} enabled
	 * @returns {void}
	 */
	set_body_collision_events(body, enabled) {
		if (!RAPIER || !body?.isValid()) {
			return;
		}
		// 2026-06-29, Composer: COLLISION_EVENTS on every body collider [rphct1]
		const flags = enabled
			? RAPIER.ActiveEvents.COLLISION_EVENTS
			: RAPIER.ActiveEvents.NONE;
		for (let i = 0; i < body.numColliders(); i++) {
			body.collider(i).setActiveEvents(flags);
		}
	}

	/**
	 * @param {number} _dt smoothed frame seconds (fallback clock)
	 * @param {number} rdt real elapsed frame seconds
	 * @returns {void}
	 */
	step(_dt, rdt) {
		if (!this.world || !this.eventQueue) {
			return;
		}

		this.sync_debug_draw(this.config.debug);

		// 2026-06-29, Composer: fixed substep accumulator drain rdt [rphstep1]
		const stepDt = this.config.ref_dt * this.tds;
		const frameDt = rdt > 0 ? rdt : _dt;
		this._acc += frameDt;

		while (this._acc >= stepDt) {
			this.world.integrationParameters.dt = stepDt;
			this.world.step(this.eventQueue);
			this._drain_contacts();
			this._acc -= stepDt;
		}

		// 2026-06-29, Composer: resetForces once after substep batch [rphclr1]
		for (const id in this.bodylist) {
			const body = this.bodylist[id];
			if (body.isDynamic()) {
				body.resetForces(true);
			}
		}

		if (this.debug_draw) {
			const canvas = this._render.renderer?.domElement;
			if (canvas) {
				this.debug_draw.lineMaterial.resolution.set(canvas.width, canvas.height);
			}
			this.debug_draw.update(this.world.debugRender());
		}

		for (const k in this.meshlist) {
			this.step_attach(k);
		}
	}

	/** @returns {void} */
	_drain_contacts() {
		if (!this._collision_handler || !this.eventQueue) {
			return;
		}
		const handler = this._collision_handler;
		this.eventQueue.drainCollisionEvents((h1, h2, started) => {
			handler(started, h1, h2);
		});
	}

	/**
	 * @param {string|number} id
	 * @returns {void}
	 */
	step_attach(id) {
		const body = this.bodylist[id];
		const mesh = this.meshlist[id];
		const opts = this.attachopts[id];
		if (!body || !mesh) {
			return;
		}

		const parent_wp =
			mesh.parent?.getWorldPosition(cache.vec3.v9) ??
			cache.vec3.v9.set(0, 0, 0);
		const position = body.translation();
		const rotation = body.rotation();
		const shift = cache.vec3.v0;
		shift.set(0, 0, 0);
		if (opts?.shift) {
			shift.copy(opts.shift);
			shift.applyQuaternion(
				_worldQuat.set(rotation.x, rotation.y, rotation.z, rotation.w),
			);
		}
		if (opts?.allow_translate ?? true) {
			mesh.position.x = position.x + shift.x - parent_wp.x;
			mesh.position.y = position.y + shift.y - parent_wp.y;
			mesh.position.z = position.z + shift.z - parent_wp.z;
		}
		if (opts?.allow_rotate ?? true) {
			mesh.quaternion.x = rotation.x;
			mesh.quaternion.y = rotation.y;
			mesh.quaternion.z = rotation.z;
			mesh.quaternion.w = rotation.w;
		}

		if (mesh.isInstanceEntity) {
			if (opts?.allow_rotate ?? true) {
				mesh.updateMatrix();
			} else {
				mesh.updateMatrixPosition();
			}
		}
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 * @param {import("@dimforge/rapier3d").Collider} collider
	 * @param {{ itemIndex?: number|null }} [meta]
	 * @param {boolean} [primary]
	 * @returns {string|number}
	 */
	register_body(body, collider, meta, primary = true) {
		let id = body.id;
		if (id == null) {
			do {
				this.guids = (this.guids + 1) % 0xffff;
				id = this.guids;
			} while (this.bodylist[id]);
			body.id = id;
		}
		this.bodylist[id] = body;
		this.bodyMeta[id] = meta ?? { itemIndex: null };
		if (body.userData == null) {
			body.userData = {};
		}
		body.userData.itemIndex = this.bodyMeta[id].itemIndex;
		this._register_collider(id, collider, primary);
		for (let i = 0; i < body.numColliders(); i++) {
			const c = body.collider(i);
			if (c.handle !== collider.handle) {
				this._register_collider(id, c, false);
			}
		}
		return id;
	}

	/**
	 * @param {string|number} gameId
	 * @param {import("@dimforge/rapier3d").Collider} collider
	 * @param {boolean} [primary]
	 * @returns {void}
	 */
	_register_collider(gameId, collider, primary = false) {
		this.colliderToGameId.set(collider.handle, gameId);
		if (primary || !this.colliderlist[gameId]) {
			this.colliderlist[gameId] = collider;
		}
	}

	/**
	 * @param {string|number} gameId
	 * @param {{ itemIndex?: number|null }} patch
	 * @returns {void}
	 */
	set_body_meta(gameId, patch) {
		const meta = this.bodyMeta[gameId] ?? { itemIndex: null };
		Object.assign(meta, patch);
		this.bodyMeta[gameId] = meta;
		const body = this.bodylist[gameId];
		if (body) {
			if (body.userData == null) {
				body.userData = {};
			}
			body.userData.itemIndex = meta.itemIndex;
		}
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 * @returns {void}
	 */
	add_body(body) {
		const n = body.numColliders();
		const collider = n > 0 ? body.collider(0) : null;
		if (!collider) {
			return;
		}
		this.register_body(body, collider, { itemIndex: null }, true);
	}

	addBody(body) {
		this.add_body(body);
	}

	/**
	 * @param {THREE.Vector3|null} pos
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {boolean} [add]
	 * @returns {import("@dimforge/rapier3d").RigidBody}
	 */
	_create_rigid_body(pos, type, opts) {
		if (!this.world || !RAPIER) {
			return null;
		}
		const desc =
			type === RAPIER.RigidBodyType.Dynamic
				? RAPIER.RigidBodyDesc.dynamic()
				: type === RAPIER.RigidBodyType.KinematicPositionBased
					? RAPIER.RigidBodyDesc.kinematicPositionBased()
					: RAPIER.RigidBodyDesc.fixed();
		if (pos) {
			desc.setTranslation(pos.x, pos.y, pos.z);
		}
		desc.setLinearDamping(opts?.ldamping ?? 0);
		desc.setAngularDamping(opts?.adamping ?? 0);
		desc.setGravityScale(opts?.gravityscale ?? 1);
		return this.world.createRigidBody(desc);
	}

	/**
	 * @param {THREE.Vector3|null} pos
	 * @param {import("@dimforge/rapier3d").ColliderDesc} colDesc
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {boolean} [add]
	 * @returns {import("@dimforge/rapier3d").RigidBody}
	 */
	create_body_with_desc(pos, colDesc, type, opts, add = true) {
		const body = this._create_rigid_body(pos, type, opts);
		if (!body) {
			return null;
		}
		const collider = this.world.createCollider(colDesc, body);
		if (add) {
			this.register_body(body, collider, { itemIndex: null }, true);
		}
		return body;
	}

	/**
	 * @param {THREE.Vector3} pos
	 * @param {THREE.Vector3} size
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {boolean} [add]
	 */
	create_box(pos, size, type, opts, add = true) {
		if (!RAPIER) {
			return null;
		}
		const colDesc = RAPIER.ColliderDesc.cuboid(
			size.x * 0.5,
			size.y * 0.5,
			size.z * 0.5,
		)
			.setDensity(opts?.density ?? 1)
			.setFriction(opts?.friction ?? 1)
			.setRestitution(opts?.restitution ?? 0.1);
		return this.create_body_with_desc(pos, colDesc, type, opts, add);
	}

	createBox(pos, size, type, opts, add = true) {
		return this.create_box(pos, size, type, opts, add);
	}

	create_sphere(pos, radius, type, opts, add = true) {
		if (!RAPIER) {
			return null;
		}
		const colDesc = RAPIER.ColliderDesc.ball(radius)
			.setDensity(opts?.density ?? 1)
			.setFriction(opts?.friction ?? 1)
			.setRestitution(opts?.restitution ?? 0.1);
		return this.create_body_with_desc(pos, colDesc, type, opts, add);
	}

	create_cylinder(pos, size, type, opts, add = true) {
		if (!RAPIER) {
			return null;
		}
		const colDesc = RAPIER.ColliderDesc.cylinder(size.y * 0.5, size.x)
			.setDensity(opts?.density ?? 1)
			.setFriction(opts?.friction ?? 1)
			.setRestitution(opts?.restitution ?? 0.1);
		return this.create_body_with_desc(pos, colDesc, type, opts, add);
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 * @param {THREE.Object3D} mesh
	 * @param {object} [opts]
	 */
	attach(body, mesh, opts) {
		this.meshlist[body.id] = mesh;
		if (opts) {
			this.attachopts[body.id] = opts;
		}
		this.step_attach(body.id);
	}

	weld(body, mesh, opts) {
		this.attach(body, mesh, opts);
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	setBodyPosition(body, x, y, z) {
		body.setTranslation({ x, y, z }, true);
		body.setLinvel({ x: 0, y: 0, z: 0 }, true);
		body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		this.step_attach(body.id);
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 * @param {import("three").Quaternion} rotation
	 */
	setBodyRotation(body, rotation) {
		body.setRotation(
			{ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
			true,
		);
		body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		this.step_attach(body.id);
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} bodyA
	 * @param {import("@dimforge/rapier3d").RigidBody} bodyB
	 * @param {{ x: number, y: number, z: number }} anchorWorld
	 * @returns {import("@dimforge/rapier3d").ImpulseJoint|null}
	 */
	create_fixed_joint(bodyA, bodyB, anchorWorld) {
		if (!RAPIER || !this.world || !bodyA || !bodyB) {
			return null;
		}
		const posA = bodyA.translation();
		const rotA = bodyA.rotation();
		const posB = bodyB.translation();
		const rotB = bodyB.rotation();
		const anchor1 = world_to_local_point(anchorWorld, posA, rotA);
		const anchor2 = world_to_local_point(anchorWorld, posB, rotB);
		const params = RAPIER.JointData.fixed(
			anchor1,
			_IDENTITY_ROT,
			anchor2,
			_IDENTITY_ROT,
		);
		const joint = this.world.createImpulseJoint(params, bodyA, bodyB, true);
		if (!this._fixed_joints) {
			this._fixed_joints = [];
		}
		this._fixed_joints.push(joint);
		return joint;
	}

	/**
	 * @param {import("@dimforge/rapier3d").ImpulseJoint} joint
	 * @returns {void}
	 */
	remove_joint(joint) {
		if (!joint || !this.world) {
			return;
		}
		this.world.removeImpulseJoint(joint, true);
		if (this._fixed_joints) {
			const i = this._fixed_joints.indexOf(joint);
			if (i >= 0) {
				this._fixed_joints.splice(i, 1);
			}
		}
	}

	/**
	 * @param {import("@dimforge/rapier3d").RigidBody} body
	 */
	remove(body) {
		if (!body || !this.world) {
			return;
		}
		const id = body.id;
		if (id != null) {
			for (let i = 0; i < body.numColliders(); i++) {
				this.colliderToGameId.delete(body.collider(i).handle);
			}
			delete this.bodylist[id];
			delete this.bodyMeta[id];
			delete this.colliderlist[id];
		}
		if (body.isValid()) {
			this.world.removeRigidBody(body);
		}
		const mesh = id != null ? this.meshlist[id] : null;
		if (mesh?.isInstanceEntity) {
			mesh.remove();
		} else {
			mesh?.removeFromParent?.();
		}
		if (id != null) {
			delete this.meshlist[id];
			delete this.attachopts[id];
		}
	}

	/**
	 * @param {boolean} enabled
	 */
	sync_debug_draw(enabled) {
		if (!this.world) {
			return;
		}
		if (enabled) {
			if (!this.debug_draw) {
				this.debug_draw = new RapierDebugDraw(this._render.scene);
			}
			return;
		}
		if (this.debug_draw) {
			this.debug_draw.dispose?.();
			this.debug_draw = null;
		}
	}
}

export default Physics;
export { Physics, RapierDebugDraw as DebugDraw, PhysicsUtils, RAPIER, ensureRapier };
// 2026-06-29, Composer: Rapier physics world owner and step loop [rph1]
// 2026-06-29, Composer: fixed substep accumulator drain rdt [rphstep1]
// 2026-06-29, Composer: resetForces once after substep batch [rphclr1]
// 2026-06-29, Composer: Rapier debugRender line segments [rphdb1]
// 2026-06-29, Composer: COLLISION_EVENTS on every body collider [rphct1]
// 2026-06-29, Composer: sync start empty until bootstrap loads Rapier [rphdyn1]
// 2026-06-29, Composer: dynamic import rapier3d deferred to bootstrap [rphdyn1]
