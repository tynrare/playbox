/** @namespace ty */
// Purpose: smooth zoom camera for zoomable toys; owns draw.active_camera while zoomed.

import * as THREE from "three";
import { dlerp_vec3 } from "../math.js";
import {
	TOY_INDEX_INVALID,
	VAR_TOY_INDEX,
} from "../scene/itembox.js";

const ZOOM_MARGIN = 0.2;
const ZOOM_DECAY = 0.2;
const SETTLE_EPS = 0.02;
const LOOK_AHEAD = 100;

const _bbox = new THREE.Box3();
const _union = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _target_pos = new THREE.Vector3();
const _target_look = new THREE.Vector3();
const _home_pos = new THREE.Vector3();
const _home_look = new THREE.Vector3();
const _cam_look = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local_pos = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _collider_t = { x: 0, y: 0, z: 0 };
const _collider_r = { x: 0, y: 0, z: 0, w: 1 };

/** @type {readonly [number, number, number][]} */
const _CUBOID_CORNERS = [
	[-1, -1, -1],
	[-1, -1, 1],
	[-1, 1, -1],
	[-1, 1, 1],
	[1, -1, -1],
	[1, -1, 1],
	[1, 1, -1],
	[1, 1, 1],
];

/**
 * @param {import("three").PerspectiveCamera} camera
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
function _camera_look_point(camera, out) {
	camera.getWorldDirection(_dir);
	out.copy(camera.position).addScaledVector(_dir, LOOK_AHEAD);
	return out;
}

/**
 * @param {import("three").PerspectiveCamera} from
 * @param {import("three").PerspectiveCamera} to
 * @returns {void}
 */
function _copy_camera_pose(from, to) {
	to.position.copy(from.position);
	to.quaternion.copy(from.quaternion);
	to.fov = from.fov;
	to.aspect = from.aspect;
	to.near = from.near;
	to.far = from.far;
	to.updateProjectionMatrix();
	to.updateMatrixWorld();
}

/**
 * @param {import("@dimforge/rapier3d").Collider} collider
 * @param {THREE.Box3} box
 * @returns {boolean}
 */
function _expand_collider_aabb(collider, box) {
	const he = collider.halfExtents();
	if (!he) {
		return false;
	}

	const t = collider.translation(_collider_t);
	const r = collider.rotation(_collider_r);
	_quat.set(r.x, r.y, r.z, r.w);

	for (let i = 0; i < 8; i++) {
		const c = _CUBOID_CORNERS[i];
		_corner.set(c[0] * he.x, c[1] * he.y, c[2] * he.z);
		_corner.applyQuaternion(_quat);
		_corner.x += t.x;
		_corner.y += t.y;
		_corner.z += t.z;
		box.expandByPoint(_corner);
	}
	return true;
}

/**
 * @param {import("@dimforge/rapier3d").RigidBody} body
 * @param {THREE.Box3} box
 * @returns {boolean}
 */
function _body_world_aabb(body, box) {
	box.makeEmpty();
	const n = body.numColliders();
	for (let i = 0; i < n; i++) {
		_expand_collider_aabb(body.collider(i), box);
	}
	return !box.isEmpty();
}

/**
 * @class ArcadeTopter
 * @memberof pb.play
 */
class ArcadeTopter {
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
		/** @type {THREE.PerspectiveCamera|null} */
		this._camera = null;
		/** @type {number|null} */
		this._equalizer_id = null;
		/** @type {number|null} */
		this._click_id = null;
		/** @type {number|null} */
		this._zoom_root = null;
		/** @type {boolean} */
		this._unzooming = false;
		return this;
	}

	/** @returns {void} */
	start() {
		const main = this._core.render.camera;
		if (!main) {
			return;
		}

		// 2026-07-01, Composer: topter camera cloned from main on start [plzom1]
		this._camera = main.clone();
		_copy_camera_pose(main, this._camera);
		_camera_look_point(this._camera, _cam_look);

		this._equalizer_id = this._core.eventsbus.on(
			"draw.equalizer",
			this._on_equalizer.bind(this),
		);
		this._click_id = this._core.eventsbus.on(
			"arcade.click",
			// 2026-07-01, Composer: zoom and unzoom via arcade.click [plzom7]
			this._on_arcade_click.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._equalizer_id != null) {
			this._core.eventsbus.off(this._equalizer_id);
			this._equalizer_id = null;
		}
		if (this._click_id != null) {
			this._core.eventsbus.off(this._click_id);
			this._click_id = null;
		}
		this._zoom_root = null;
		this._unzooming = false;
		if (this._core.render.camera) {
			this._core.draw.active_camera = this._core.render.camera;
		}
		this._camera = null;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	step(dt) {
		const cam = this._camera;
		const main = this._core.render.camera;
		if (!cam || !main) {
			return;
		}

		if (this._zoom_root != null) {
			this._compute_zoom_targets(cam);
			this._dlerp_camera(dt, _target_pos, _target_look);
			return;
		}

		if (this._unzooming) {
			this._refresh_home_from_main(main);
			this._dlerp_camera(dt, _home_pos, _home_look);
			if (this._is_settled(_home_pos, _home_look)) {
				this._unzooming = false;
				this._core.draw.active_camera = main;
			}
		}
	}

	/** @returns {void} */
	_on_equalizer() {
		const main = this._core.render.camera;
		const cam = this._camera;
		if (!main || !cam) {
			return;
		}
		cam.fov = main.fov;
		cam.aspect = main.aspect;
		cam.updateProjectionMatrix();
	}

	/**
	 * @param {number} toyIndex
	 * @returns {number}
	 */
	_pick_root(toyIndex) {
		const welds = this._core.toybox.modulebox.welds;
		return welds.is_member(toyIndex) ? welds.get_parent(toyIndex) : toyIndex;
	}

	/**
	 * @param {{ itemIndex: number }} payload
	 * @returns {void}
	 */
	_on_arcade_click({ itemIndex }) {
		const toyIndex = this._core.itembox.mempool.read_ui16(itemIndex, VAR_TOY_INDEX);
		if (toyIndex === TOY_INDEX_INVALID) {
			// 2026-07-01, Composer: floor click unzooms when zoomed [plzom3]
			if (this._zoom_root != null || this._unzooming) {
				this._begin_unzoom();
			}
			return;
		}

		const root = this._pick_root(toyIndex);

		if (this._zoom_root != null && root === this._zoom_root) {
			return;
		}

		if (this._core.toybox.has_tag(root, "zoomable")) {
			if (this._unzooming) {
				// 2026-07-01, Composer: re-zoom during unzoom from current cam [plzom4]
				this._begin_zoom(root);
				return;
			}
			if (this._zoom_root != null) {
				this._begin_unzoom();
				return;
			}
			this._begin_zoom(root);
			return;
		}

		if (this._zoom_root != null || this._unzooming) {
			this._begin_unzoom();
		}
	}

	/**
	 * @param {number} rootIndex
	 * @returns {void}
	 */
	_begin_zoom(rootIndex) {
		const main = this._core.render.camera;
		const cam = this._camera;
		if (!main || !cam) {
			return;
		}

		if (!this._unzooming && this._zoom_root == null) {
			_copy_camera_pose(main, cam);
			_camera_look_point(cam, _cam_look);
		}

		this._zoom_root = rootIndex;
		this._unzooming = false;
		this._core.draw.active_camera = cam;
	}

	/** @returns {void} */
	_begin_unzoom() {
		this._zoom_root = null;
		this._unzooming = true;
	}

	/**
	 * @param {import("three").PerspectiveCamera} main
	 * @returns {void}
	 */
	_refresh_home_from_main(main) {
		_home_pos.copy(main.position);
		_camera_look_point(main, _home_look);
	}

	/**
	 * @param {number} rootIndex
	 * @returns {import("@dimforge/rapier3d").RigidBody|null}
	 */
	_root_body(rootIndex) {
		const itemIndex = this._core.toybox.get_item_index(rootIndex);
		return this._core.scene.get_itembody(itemIndex);
	}

	/**
	 * @param {import("three").PerspectiveCamera} cam
	 * @returns {void}
	 */
	_compute_zoom_targets(cam) {
		const root = this._zoom_root;
		if (root == null || !this._toy_bounds(root, _bbox)) {
			return;
		}

		const body = this._root_body(root);
		if (body == null) {
			return;
		}

		_bbox.getCenter(_center);
		_bbox.getSize(_size);

		const margin = 1 + ZOOM_MARGIN;
		const maxDim = Math.max(_size.x, _size.y, _size.z) * margin;
		const vfov = THREE.MathUtils.degToRad(cam.fov);
		const hfov = 2 * Math.atan(Math.tan(vfov * 0.5) * cam.aspect);
		const distV = (maxDim * 0.5) / Math.tan(vfov * 0.5);
		const distH = (maxDim * 0.5) / Math.tan(hfov * 0.5);
		const dist = Math.max(distV, distH);

		// 2026-07-01, Composer: zoom cam local y above plus z=1 body rotation [plzom6]
		const r = body.rotation(_collider_r);
		_quat.set(r.x, r.y, r.z, r.w);
		_local_pos.set(0, dist, 1);
		_local_pos.applyQuaternion(_quat);
		_target_pos.copy(_center).add(_local_pos);
		_target_look.copy(_center);
	}

	/**
	 * @param {number} rootIndex
	 * @param {THREE.Box3} out
	 * @returns {boolean}
	 */
	_toy_bounds(rootIndex, out) {
		const { scene, toybox } = this._core;
		const welds = toybox.modulebox.welds;
		out.makeEmpty();

		const toys = [rootIndex];
		if (welds.is_root(rootIndex)) {
			const count = welds.member_count(rootIndex);
			for (let i = 0; i < count; i++) {
				const member = welds.get_member(rootIndex, i);
				if (member !== TOY_INDEX_INVALID) {
					toys.push(member);
				}
			}
		}

		let any = false;
		for (let i = 0; i < toys.length; i++) {
			const itemIndex = toybox.get_item_index(toys[i]);
			const body = scene.get_itembody(itemIndex);
			if (body == null || !_body_world_aabb(body, _union)) {
				continue;
			}
			out.union(_union);
			any = true;
		}
		return any;
	}

	/**
	 * @param {number} dt
	 * @param {THREE.Vector3} pos
	 * @param {THREE.Vector3} look
	 * @returns {void}
	 */
	_dlerp_camera(dt, pos, look) {
		const cam = this._camera;
		if (!cam) {
			return;
		}

		dlerp_vec3(cam.position, pos, ZOOM_DECAY, dt);
		dlerp_vec3(_cam_look, look, ZOOM_DECAY, dt);
		cam.lookAt(_cam_look);
		cam.updateMatrixWorld();
	}

	/**
	 * @param {THREE.Vector3} pos
	 * @param {THREE.Vector3} look
	 * @returns {boolean}
	 */
	_is_settled(pos, look) {
		const cam = this._camera;
		if (!cam) {
			return true;
		}
		return (
			cam.position.distanceToSquared(pos) <= SETTLE_EPS * SETTLE_EPS
			&& _cam_look.distanceToSquared(look) <= SETTLE_EPS * SETTLE_EPS
		);
	}
}

export default ArcadeTopter;
// 2026-07-01, Composer: topter camera cloned from main on start [plzom1]
// 2026-07-01, Composer: floor click unzooms when zoomed [plzom3]
// 2026-07-01, Composer: re-zoom during unzoom from current cam [plzom4]
// 2026-07-01, Composer: zoom cam local y above plus z=1 body rotation [plzom6]
// 2026-07-01, Composer: zoom and unzoom via arcade.click [plzom7]
