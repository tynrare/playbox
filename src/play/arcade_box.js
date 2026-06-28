/** @namespace ty */
// Purpose: fixed-size static walls aligned to camera frustum on y=0.

import * as THREE from "three";
import { oimo } from "../lib/OimoPhysics.js";
import { RigidBody, RigidBodyType } from "../core/physics.js";
import { v3up, vzero } from "../math.js";

const WALL_LENGTH = 256;
const WALL_WIDTH = 2;
const WALL_HEIGHT = 20;
const WALL_INSET = 0.1;
const GROUND_Y = 0;

const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3up, vzero);
const _corners = [
	new THREE.Vector3(),
	new THREE.Vector3(),
	new THREE.Vector3(),
	new THREE.Vector3(),
];
const _mid = new THREE.Vector3();
const _centroid = new THREE.Vector3();
const _inward = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _halfExtents = new oimo.common.Vec3(
	WALL_WIDTH * 0.5,
	WALL_HEIGHT * 0.5,
	WALL_LENGTH * 0.5,
);

/** @type {readonly [number, number][]} */
const NDC_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** @type {readonly [number, number][]} */
const WALL_EDGES = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 0],
];

/**
 * @class ArcadeBox
 * @memberof pb.play
 */
class ArcadeBox {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		this._core = core;
	}

	/**
	 * @returns {this}
	 */
	init() {
		/** @type {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody[]} */
		this._walls = [];
		/** @type {number|null} */
		this._equalizer_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-06-28, Composer: draw.equalizer aligns fixed walls [plbox1]
		this._equalizer_id = this._core.eventsbus.on(
			"draw.equalizer",
			this._on_equalizer.bind(this),
		);
		this._create_walls();
		this._align_walls();
	}

	/** @returns {void} */
	stop() {
		if (this._equalizer_id != null) {
			this._core.eventsbus.off(this._equalizer_id);
			this._equalizer_id = null;
		}
		this._discard_walls();
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/** @returns {void} */
	_on_equalizer() {
		this._align_walls();
	}

	/**
	 * @returns {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody}
	 */
	_make_wall_body() {
		// 2026-06-28, Composer: shape offset bottom flush at body origin [plbox4]
		const physics = this._core.physics;
		const body_config = new oimo.dynamics.rigidbody.RigidBodyConfig();
		body_config.position.init(0, GROUND_Y, 0);
		body_config.type = RigidBodyType.STATIC;
		const body = new RigidBody(body_config);
		const shape_config = new oimo.dynamics.rigidbody.ShapeConfig();
		shape_config.position.init(0, WALL_HEIGHT * 0.5, 0);
		shape_config.geometry = new oimo.collision.geometry.BoxGeometry(_halfExtents);
		shape_config.density = 1;
		shape_config.friction = 1;
		shape_config.restitution = 0;
		body.addShape(new oimo.dynamics.rigidbody.Shape(shape_config));
		physics.add_body(body);
		return body;
	}

	/** @returns {void} */
	_create_walls() {
		// 2026-06-28, Composer: fixed len walls created once no resize [plbox2]
		for (let i = 0; i < 4; i++) {
			this._walls.push(this._make_wall_body());
		}
	}

	/**
	 * @returns {boolean}
	 */
	_trace_ground_corners() {
		const camera = this._core.render.camera;
		if (!camera) {
			return false;
		}

		_groundPlane.constant = -GROUND_Y;
		for (let i = 0; i < 4; i++) {
			const ndc = NDC_CORNERS[i];
			_ndc.set(ndc[0], ndc[1]);
			_raycaster.setFromCamera(_ndc, camera);
			if (!_raycaster.ray.intersectPlane(_groundPlane, _hit)) {
				return false;
			}
			_corners[i].copy(_hit);
		}
		return true;
	}

	/** @returns {void} */
	_align_walls() {
		if (!this._trace_ground_corners() || this._walls.length !== 4) {
			return;
		}

		// 2026-06-28, Composer: yaw from ground edge dx dz CCW corners [plbox7]
		// 2026-06-28, Composer: half thickness plus inset inward from edge [plbox8]
		const physics = this._core.physics;
		const inward_offset = -WALL_WIDTH * 0.5 + WALL_INSET;

		_centroid.set(0, GROUND_Y, 0);
		for (let j = 0; j < 4; j++) {
			_centroid.add(_corners[j]);
		}
		_centroid.multiplyScalar(0.25);

		for (let i = 0; i < 4; i++) {
			const edge = WALL_EDGES[i];
			const a = _corners[edge[0]];
			const b = _corners[edge[1]];

			_mid.addVectors(a, b).multiplyScalar(0.5);
			const dx = b.x - a.x;
			const dz = b.z - a.z;
			if (dx * dx + dz * dz <= 0) {
				continue;
			}

			_inward.subVectors(_centroid, _mid).setY(0);
			if (_inward.lengthSq() <= 0) {
				continue;
			}
			_inward.normalize();

			_quat.setFromAxisAngle(v3up, Math.atan2(dx, dz));
			_pos.copy(_mid).addScaledVector(_inward, inward_offset);
			const body = this._walls[i];
			physics.setBodyRotation(body, _quat);
			physics.setBodyPosition(body, _pos.x, GROUND_Y, _pos.z);
		}
	}

	/** @returns {void} */
	_discard_walls() {
		const physics = this._core.physics;
		for (let i = 0; i < this._walls.length; i++) {
			physics.remove(this._walls[i]);
		}
		this._walls.length = 0;
	}
}

export default ArcadeBox;
// 2026-06-28, Composer: draw.equalizer aligns fixed walls [plbox1]
// 2026-06-28, Composer: fixed len walls created once no resize [plbox2]
// 2026-06-28, Composer: shape offset bottom flush at body origin [plbox4]
// 2026-06-28, Composer: yaw from ground edge dx dz CCW corners [plbox7]
// 2026-06-28, Composer: half thickness plus inset inward from edge [plbox8]
