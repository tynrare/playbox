/** @namespace ty */
// Purpose: fixed-size static walls aligned to camera frustum on y=0.

import * as THREE from "three";
import { RAPIER } from "../core/physics.js";
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
		/** @type {import("@dimforge/rapier3d").RigidBody[]} */
		this._walls = [];
		/** @type {number|null} */
		this._equalizer_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
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
	 * @returns {import("@dimforge/rapier3d").RigidBody}
	 */
	_make_wall_body() {
		// 2026-06-29, Composer: Rapier fixed wall cuboid collider [plbox1]
		const physics = this._core.physics;
		const world = physics.world;
		const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y, 0);
		const body = world.createRigidBody(desc);
		const colDesc = RAPIER.ColliderDesc.cuboid(
			WALL_WIDTH * 0.5,
			WALL_HEIGHT * 0.5,
			WALL_LENGTH * 0.5,
		)
			.setTranslation(0, WALL_HEIGHT * 0.5, 0)
			.setDensity(1)
			.setFriction(1)
			.setRestitution(0);
		const collider = world.createCollider(colDesc, body);
		physics.register_body(body, collider, { itemIndex: null }, true);
		return body;
	}

	/** @returns {void} */
	_create_walls() {
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
// 2026-06-29, Composer: Rapier fixed wall cuboid collider [plbox1]
