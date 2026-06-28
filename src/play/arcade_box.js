/** @namespace ty */
// Purpose: fixed-size static walls aligned to camera frustum on y=0.

import * as THREE from "three";
import { RigidBodyType } from "../core/physics.js";
import { cache, v3up, vzero } from "../math.js";

const WALL_LENGTH = 256;
const WALL_WIDTH = 2;
const WALL_HEIGHT = 20;
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
const _centroid = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _edgeDir = new THREE.Vector3();
const _inward = new THREE.Vector3();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _quat = new THREE.Quaternion();
const _boxSize = new THREE.Vector3(WALL_LENGTH, WALL_HEIGHT, WALL_WIDTH);

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

	/** @returns {void} */
	_create_walls() {
		// 2026-06-28, Composer: fixed len walls created once no resize [plbox2]
		const physics = this._core.physics;
		const origin = cache.vec3.v0.set(0, WALL_HEIGHT * 0.5, 0);
		for (let i = 0; i < 4; i++) {
			const body = physics.create_box(origin, _boxSize, RigidBodyType.STATIC);
			this._walls.push(body);
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

		// 2026-06-28, Composer: reposition rotate walls to frustum edges [plbox1]
		_centroid.set(0, 0, 0);
		for (let i = 0; i < 4; i++) {
			_centroid.add(_corners[i]);
		}
		_centroid.multiplyScalar(0.25);

		const physics = this._core.physics;
		const halfWidth = WALL_WIDTH * 0.5;
		const centerY = WALL_HEIGHT * 0.5;

		for (let i = 0; i < 4; i++) {
			const edge = WALL_EDGES[i];
			const a = _corners[edge[0]];
			const b = _corners[edge[1]];

			_mid.addVectors(a, b).multiplyScalar(0.5);
			_edgeDir.subVectors(b, a);
			_edgeDir.y = 0;
			const edgeLen = _edgeDir.length();
			if (edgeLen <= 0) {
				continue;
			}
			_edgeDir.multiplyScalar(1 / edgeLen);

			_inward.set(_edgeDir.z, 0, -_edgeDir.x);
			if (_inward.dot(_centroid) - _inward.dot(_mid) < 0) {
				_inward.negate();
			}

			_quat.setFromUnitVectors(_xAxis, _edgeDir);
			const body = this._walls[i];
			physics.setBodyRotation(body, _quat);
			physics.setBodyPosition(
				body,
				_mid.x + _inward.x * halfWidth,
				centerY,
				_mid.z + _inward.z * halfWidth,
			);
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
// 2026-06-28, Composer: reposition rotate walls to frustum edges [plbox1]
