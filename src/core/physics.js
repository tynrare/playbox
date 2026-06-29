/** @namespace ty */
// 2026-06-14, Composer: Oimo physics DebugDraw PhysicsUtils port [phy1]
import * as THREE from "three";
import { cache } from "../math.js";
import { oimo } from "../lib/OimoPhysics.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

const RigidBodyType = oimo.dynamics.rigidbody.RigidBodyType;
const RigidBody = oimo.dynamics.rigidbody.RigidBody;
const PositionCorrectionAlgorithm =
	oimo.dynamics.constraint.PositionCorrectionAlgorithm;

// 2026-06-27, Composer: Oimo contact solver tuning [physlv1]
const SOLVER_VELOCITY_ITERATIONS = 10;
const SOLVER_POSITION_ITERATIONS = 5;
const SOLVER_LINEAR_SLOP = 0.005;
const SOLVER_DEFAULT_CONTACT_POSITION_ALG =
	PositionCorrectionAlgorithm.BAUMGARTE;
const SOLVER_ALT_CONTACT_POSITION_ALG = PositionCorrectionAlgorithm.SPLIT_IMPULSE;
const SOLVER_CONTACT_ALT_DEPTH_THRESHOLD = 0.05;
const SOLVER_VELOCITY_BAUMGARTE = 0.2;
const SOLVER_POSITION_SPLIT_IMPULSE_BAUMGARTE = 0.4;
const SOLVER_POSITION_NGS_BAUMGARTE = 1.0;

const DEFAULT_CONFIG = {
	ref_dt: 0.008,
	debug: false,
};

/** @returns {void} */
function apply_solver_settings() {
	const s = oimo.common.Setting;
	s.linearSlop = SOLVER_LINEAR_SLOP;
	s.defaultContactPositionCorrectionAlgorithm =
		SOLVER_DEFAULT_CONTACT_POSITION_ALG;
	s.alternativeContactPositionCorrectionAlgorithm =
		SOLVER_ALT_CONTACT_POSITION_ALG;
	s.contactUseAlternativePositionCorrectionAlgorithmDepthThreshold =
		SOLVER_CONTACT_ALT_DEPTH_THRESHOLD;
	s.velocityBaumgarte = SOLVER_VELOCITY_BAUMGARTE;
	s.positionSplitImpulseBaumgarte = SOLVER_POSITION_SPLIT_IMPULSE_BAUMGARTE;
	s.positionNgsBaumgarte = SOLVER_POSITION_NGS_BAUMGARTE;
}

/**
 * @class DebugDraw
 * @memberof pb.core
 */
class DebugDraw extends oimo.dynamics.common.DebugDraw {
	/**
	 * @param {THREE.Scene} scene
	 */
	constructor(scene) {
		super();
		// 2026-06-14, Composer: wireframe only line() implemented not triangle [phydb1]
		this.wireframe = true;
		this.drawJointLimits = true;
		this.drawBases = true;
		this._scene = scene;
		const lineMaterial = new LineMaterial({
			color: 0xffffff,
			vertexColors: true,
			linewidth: 4,
			alphaToCoverage: true,
		});
		this.lineMaterial = lineMaterial;
		this.init(900);
	}

	begin() {
		this.iterator = 0;
	}

	/**
	 * @param {oimo.common.Vec3} from
	 * @param {oimo.common.Vec3} to
	 * @param {oimo.common.Vec3} color
	 */
	line(from, to, color) {
		const i = this.iterator;
		if (i + 6 > this.linePositions.length) {
			this.init(this.linePositions.length * 2);
			return;
		}

		this.linePositions[i + 0] = from.x;
		this.linePositions[i + 1] = from.y;
		this.linePositions[i + 2] = from.z;
		this.linePositions[i + 3] = to.x;
		this.linePositions[i + 4] = to.y;
		this.linePositions[i + 5] = to.z;
		this.lineColors[i + 0] = color.x;
		this.lineColors[i + 1] = color.y;
		this.lineColors[i + 2] = color.z;
		this.lineColors[i + 3] = color.x;
		this.lineColors[i + 4] = color.y;
		this.lineColors[i + 5] = color.z;
		this.iterator += 6;
	}

	/**
	 * @param {number} pointscount
	 */
	init(pointscount) {
		this.linePositions = new Float32Array(pointscount);
		this.lineColors = new Float32Array(pointscount);
		const geometry = new LineSegmentsGeometry();
		this.geometry = geometry;
		this.lines?.removeFromParent();
		this.lines = new LineSegments2(geometry, this.lineMaterial);
		this._scene.add(this.lines);
	}

	dispose() {
		this.lines?.removeFromParent();
		this.geometry?.dispose();
		this.lineMaterial?.dispose();
		this.lines = null;
		this.geometry = null;
		this.linePositions = null;
		this.lineColors = null;
	}

	end() {
		for (let i = this.iterator; i < this.linePositions.length; i++) {
			this.linePositions[i] = 1;
			this.lineColors[i] = 1;
		}
		this.geometry.setPositions(this.linePositions);
		this.geometry.setColors(this.lineColors);
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

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} a
	 * @param {oimo.dynamics.rigidbody.RigidBody} b
	 * @param {oimo.common.Vec3} anchor
	 */
	create_generic_joint(a, b, anchor) {
		const j = oimo.dynamics.constraint.joint;
		const config = new j.GenericJointConfig();
		const m = new oimo.common.Mat3();
		config.init(b, a, anchor, m, m);
		const rotXLimit = new j.RotationalLimitMotor().setLimits(0, 0);
		const rotYLimit = new j.RotationalLimitMotor().setLimits(0, 0);
		const rotZLimit = new j.RotationalLimitMotor().setLimits(0, 0);
		const translXLimit = new j.TranslationalLimitMotor().setLimits(0, 0);
		const translYLimit = new j.TranslationalLimitMotor().setLimits(0, 0);
		const translZLimit = new j.TranslationalLimitMotor().setLimits(0, 0);
		const transXSd = new j.SpringDamper().setSpring(4, 1);
		const transYSd = new j.SpringDamper().setSpring(4, 1);
		const transZSd = new j.SpringDamper().setSpring(4, 1);
		const rotXSd = new j.SpringDamper().setSpring(4, 1);
		const rotYSd = new j.SpringDamper().setSpring(4, 1);
		const rotZSd = new j.SpringDamper().setSpring(4, 1);
		config.translationalLimitMotors = [
			translXLimit,
			translYLimit,
			translZLimit,
		];
		config.translationalSpringDampers = [transXSd, transYSd, transZSd];
		config.rotationalLimitMotors = [rotXLimit, rotYLimit, rotZLimit];
		config.rotationalSpringDampers = [rotXSd, rotYSd, rotZSd];
		const joint = new oimo.dynamics.constraint.joint.GenericJoint(config);
		this._physics.world.addJoint(joint);
		const rlm = joint.getRotationalLimitMotors();
		const tsd = joint.getTranslationalSpringDampers();
		return {
			joint,
			rotXLimit: rlm[0],
			rotYLimit: rlm[1],
			rotZLimit: rlm[2],
			transXSd: tsd[0],
			transYSd: tsd[1],
			transZSd: tsd[2],
		};
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} a
	 * @param {oimo.dynamics.rigidbody.RigidBody} b
	 * @param {oimo.common.Vec3} anchor
	 */
	create_spherical_joint(a, b, anchor) {
		const j = oimo.dynamics.constraint.joint;
		const config = new j.SphericalJointConfig();
		config.init(a, b, anchor);
		config.springDamper.frequency = 4.0;
		config.springDamper.dampingRatio = 1.0;
		const joint = new j.SphericalJoint(config);
		this._physics.world.addJoint(joint);
		return joint;
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
		/** @type {oimo.dynamics.World|null} */
		this.world = null;
		/** @type {DebugDraw|null} */
		this.debug_draw = null;
		/** @type {Object<string, oimo.dynamics.rigidbody.RigidBody>} */
		this.bodylist = {};
		/** @type {Object<string, THREE.Object3D>} */
		this.meshlist = {};
		/** @type {Object<string, { shift?: THREE.Vector3, allow_rotate?: boolean, allow_translate?: boolean }>} */
		this.attachopts = {};
		this.cache = {
			vec3_0: new oimo.common.Vec3(),
			vec3_1: new oimo.common.Vec3(),
			vec3_2: new oimo.common.Vec3(),
			vec3_3: new oimo.common.Vec3(),
			vec3up: new oimo.common.Vec3().init(0, 1, 0),
			quat: new oimo.common.Quat(),
			mat3: new oimo.common.Mat3(),
			transform: new oimo.common.Transform(),
			transformZero: new oimo.common.Transform(),
		};
		this.guids = 0;
		/** @type {import("../lib/OimoPhysics.js").oimo.dynamics.constraint.joint.GenericJoint[]} */
		this._fixed_joints = [];
	}

	/**
	 * @returns {Physics}
	 */
	init() {
		// 2026-06-17, Composer: core init drives all children [crcyc5]
		return this;
	}

	/**
	 * @returns {Physics}
	 */
	start() {
		// 2026-06-14, Composer: Oimo world on start floor via toybox [phy3]
		// 2026-06-18, Composer: fixed substep accumulator reset on start [phyacc1]
		// 2026-06-27, Composer: Oimo contact solver tuning [physlv1]
		this.guids = 0;
		this._acc = 0;
		apply_solver_settings();
		this.world = new oimo.dynamics.World(
			oimo.collision.broadphase.BroadPhaseType.BVH,
			new oimo.common.Vec3(0, -9.8, 0),
		);
		this.world.setNumVelocityIterations(SOLVER_VELOCITY_ITERATIONS);
		this.world.setNumPositionIterations(SOLVER_POSITION_ITERATIONS);
		// 2026-06-28, Composer: defer Oimo force clear to substep batch end [phyclr1]
		this.world.setAutoClearForces(false);
		this.utils = new PhysicsUtils(this, this._render.scene);
		this.sync_debug_draw(this.config.debug);
		return this;
	}

	stop() {
		this.sync_debug_draw(false);
		for (const k in this.bodylist) {
			this.remove(this.bodylist[k]);
		}
		this.world = null;
		this.bodylist = {};
		this.meshlist = {};
		this.attachopts = {};
		this._fixed_joints = [];
		this._acc = 0;
	}

	/** @returns {void} */
	dispose() {
		// 2026-06-17, Composer: physics dispose unwinds start [phydsp1]
		this.stop();
	}

	/**
	 * @param {number} _dt smoothed frame seconds (fallback clock)
	 * @param {number} rdt real elapsed frame seconds
	 * @returns {void}
	 */
	step(_dt, rdt) {
		if (!this.world) {
			return;
		}

		this.sync_debug_draw(this.config.debug);

		// 2026-06-18, Composer: fixed substep accumulator drain all rdt [phyacc1]
		const stepDt = this.config.ref_dt * this.tds;
		const frameDt = rdt > 0 ? rdt : _dt;
		this._acc += frameDt;

		while (this._acc >= stepDt) {
			this.world.step(stepDt);
			this._acc -= stepDt;
		}

		// 2026-06-28, Composer: defer Oimo force clear to substep batch end [phyclr1]
		this.world.clearForces();

		if (this.debug_draw) {
			const canvas = this._render.renderer?.domElement;
			if (canvas) {
				this.debug_draw.lineMaterial.resolution.set(canvas.width, canvas.height);
			}
			this.debug_draw.begin();
			this.world.debugDraw();
			this.debug_draw.end();
		}

		for (const k in this.meshlist) {
			this.step_attach(k);
		}
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
		const position = this.cache.vec3_0;
		body.getPositionTo(position);
		const quaternion = this.cache.quat;
		body.getOrientationTo(quaternion);
		const shift = cache.vec3.v0;
		shift.set(0, 0, 0);
		if (opts?.shift) {
			shift.copy(opts.shift);
			shift.applyQuaternion(quaternion);
		}
		if (opts?.allow_translate ?? true) {
			mesh.position.x = position.x + shift.x - parent_wp.x;
			mesh.position.y = position.y + shift.y - parent_wp.y;
			mesh.position.z = position.z + shift.z - parent_wp.z;
		}
		if (opts?.allow_rotate ?? true) {
			mesh.quaternion.x = quaternion.x;
			mesh.quaternion.y = quaternion.y;
			mesh.quaternion.z = quaternion.z;
			mesh.quaternion.w = quaternion.w;
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
	 * @param {THREE.Vector3|null} pos
	 * @param {oimo.collision.geometry.Geometry} geometry
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {boolean} [add]
	 * @returns {oimo.dynamics.rigidbody.RigidBody}
	 */
	create_body(pos, geometry, type, opts, add = true) {
		const body_config = new oimo.dynamics.rigidbody.RigidBodyConfig();
		if (pos) {
			body_config.position.init(pos.x, pos.y, pos.z);
		}
		body_config.type = type;
		body_config.angularDamping = opts?.adamping ?? 0;
		body_config.linearDamping = opts?.ldamping ?? 0;
		const body = new RigidBody(body_config);
		const shape_config = new oimo.dynamics.rigidbody.ShapeConfig();
		shape_config.geometry = geometry;
		shape_config.density = opts?.density ?? 1;
		shape_config.friction = opts?.friction ?? 1;
		shape_config.restitution = opts?.restitution ?? 0.1;
		const shape = new oimo.dynamics.rigidbody.Shape(shape_config);
		body.addShape(shape);
		body.setGravityScale(opts?.gravityscale ?? 1);
		if (add) {
			this.add_body(body);
		}
		return body;
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @returns {void}
	 */
	add_body(body) {
		this.world.addRigidBody(body);
		let id = body.id;
		while (!body.id) {
			this.guids = (this.guids + 1) % 0xffff;
			id = this.guids;
			if (this.bodylist[id]) {
				continue;
			}
			body.id = id;
		}
		this.bodylist[id] = body;
		body.id = id;
	}

	addBody(body) {
		this.add_body(body);
	}

	/**
	 * @param {THREE.Vector3} pos
	 * @param {THREE.Vector3} size
	 * @param {number} type
	 * @param {object} [opts]
	 * @param {boolean} [add]
	 */
	create_box(pos, size, type, opts, add = true) {
		const geometry = new oimo.collision.geometry.BoxGeometry(
			new oimo.common.Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5),
		);
		return this.create_body(pos, geometry, type, opts, add);
	}

	createBox(pos, size, type, opts, add = true) {
		return this.create_box(pos, size, type, opts, add);
	}

	create_sphere(pos, radius, type, opts, add = true) {
		const geometry = new oimo.collision.geometry.SphereGeometry(radius);
		return this.create_body(pos, geometry, type, opts, add);
	}

	create_cylinder(pos, size, type, opts, add = true) {
		const geometry = new oimo.collision.geometry.CylinderGeometry(
			size.x,
			size.y * 0.5,
		);
		return this.create_body(pos, geometry, type, opts, add);
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
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
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	setBodyPosition(body, x, y, z) {
		const v = this.cache.vec3_0.init(x, y, z);
		const t = this.cache.transformZero;
		t.setPosition(v);
		body.setTransform(t);
		body.setLinearVelocity(this.cache.vec3_1.init(0, 0, 0));
		body.setAngularVelocity(this.cache.vec3_2.init(0, 0, 0));
		this.step_attach(body.id);
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @param {import("three").Quaternion} rotation
	 */
	// 2026-06-26, Composer: setBodyRotation preserves position [phyrot1]
	setBodyRotation(body, rotation) {
		const t = this.cache.transformZero;
		body.getTransformTo(t);
		const oq = this.cache.quat;
		oq.x = rotation.x;
		oq.y = rotation.y;
		oq.z = rotation.z;
		oq.w = rotation.w;
		t.setOrientation(oq);
		body.setTransform(t);
		body.setAngularVelocity(this.cache.vec3_2.init(0, 0, 0));
		this.step_attach(body.id);
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} bodyA
	 * @param {oimo.dynamics.rigidbody.RigidBody} bodyB
	 * @param {oimo.common.Vec3} anchorWorld
	 * @returns {import("../lib/OimoPhysics.js").oimo.dynamics.constraint.joint.GenericJoint|null}
	 */
	// 2026-06-28, Composer: fixed joint weld for welded toys [phywld1]
	create_fixed_joint(bodyA, bodyB, anchorWorld) {
		if (!this.world || !bodyA || !bodyB) {
			return null;
		}
		const j = oimo.dynamics.constraint.joint;
		const config = new j.GenericJointConfig();
		const m = new oimo.common.Mat3();
		config.init(bodyB, bodyA, anchorWorld, m, m);
		const rotLimit = () => new j.RotationalLimitMotor().setLimits(0, 0);
		const transLimit = () => new j.TranslationalLimitMotor().setLimits(0, 0);
		const sd = () => new j.SpringDamper().setSpring(4, 1);
		config.translationalLimitMotors = [transLimit(), transLimit(), transLimit()];
		config.translationalSpringDampers = [sd(), sd(), sd()];
		config.rotationalLimitMotors = [rotLimit(), rotLimit(), rotLimit()];
		config.rotationalSpringDampers = [sd(), sd(), sd()];
		const joint = new j.GenericJoint(config);
		this.world.addJoint(joint);
		if (!this._fixed_joints) {
			this._fixed_joints = [];
		}
		this._fixed_joints.push(joint);
		return joint;
	}

	/**
	 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.constraint.joint.GenericJoint} joint
	 * @returns {void}
	 */
	remove_joint(joint) {
		if (!joint || !this.world) {
			return;
		}
		if (joint._world === this.world) {
			this.world.removeJoint(joint);
		}
		if (this._fixed_joints) {
			const i = this._fixed_joints.indexOf(joint);
			if (i >= 0) {
				this._fixed_joints.splice(i, 1);
			}
		}
	}

	/**
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 */
	remove(body) {
		if (!body) {
			return;
		}
		if (body._world === this.world) {
			this.world.removeRigidBody(body);
		}
		const mesh = this.meshlist[body.id];
		if (mesh?.isInstanceEntity) {
			mesh.remove();
		} else {
			mesh?.removeFromParent?.();
		}
		delete this.bodylist[body.id];
		delete this.meshlist[body.id];
		delete this.attachopts[body.id];
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
				this.debug_draw = new DebugDraw(this._render.scene);
			}
			// 2026-06-14, Composer: wireframe only line() implemented not triangle [phydb1]
			this.debug_draw.wireframe = true;
			this.debug_draw.drawJointLimits = true;
			this.debug_draw.drawBases = true;
			this.world.setDebugDraw(this.debug_draw);
			return;
		}
		if (this.debug_draw) {
			this.world.setDebugDraw(null);
			this.debug_draw.dispose?.();
			this.debug_draw = null;
		}
	}
}

export default Physics;
export { Physics, DebugDraw, PhysicsUtils, RigidBodyType, RigidBody };
// 2026-06-14, Composer: wireframe only line() implemented not triangle [phydb1]
// 2026-06-14, Composer: Oimo physics DebugDraw PhysicsUtils port [phy1]
// 2026-06-14, Composer: Oimo world on start floor via toybox [phy3]
// 2026-06-17, Composer: physics dispose unwinds start [phydsp1]
// 2026-06-18, Composer: fixed substep accumulator drain all rdt [phyacc1]
// 2026-06-26, Composer: setBodyRotation preserves position [phyrot1]
// 2026-06-27, Composer: Oimo contact solver tuning [physlv1]
// 2026-06-28, Composer: defer Oimo force clear to substep batch end [phyclr1]
