/** @namespace ty */
// Purpose: per-toy arcade handlers — init/dispose/update and button pick routing.

import * as THREE from "three";
import { BB_KEY_PLAY } from "../scene/blackboard.js";
import {
	TOY_INDEX_INVALID,
	VAR_TOY_INDEX,
} from "../scene/itembox.js";

const ARCADER_A_TOY_DB_ID = 8;
const ARCADER_A_MODEL_KEY = "arcader_a";
const ARCADER_A_ARCADE_KEY = "arcader_a_toy";

const DEFAULT_REVOLVER_PATTERN = "arcader_a_revolver_*";
// 2026-06-30, Composer: constant revolver spin speed [pltoy15]
const SPIN_SPEED = 10;
const SNAP_RATE = 12;
const SNAP_DONE_EPS = 1e-3;
const VAR_PLAY_ARCADER_DONE = 6;
const MATCH_SPAWN_IMPULSE = 4.0;
const MATCH_SPAWN_SPREAD = 0.22;
const MATCH_SPAWN_DELAY = 0.1;
// 2026-07-01, GPT-5.5: arcader revolver and reward sfx [plsfx5]
const SFX_REVOLVER_PASS = "switch12";
const SFX_REVOLVER_STOP = "click4";
const SFX_REWARD_SPAWN = "confirmation_001";

const _yUp = new THREE.Vector3(0, 1, 0);
const _unitScale = new THREE.Vector3(1, 1, 1);
const _bbox = new THREE.Box3();
const _size = new THREE.Vector3();
const _facePos = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _faceQuat = new THREE.Quaternion();
const _faceLocal = new THREE.Matrix4();
const _worldMat = new THREE.Matrix4();
const _ownerInv = new THREE.Matrix4();
const _localMat = new THREE.Matrix4();
const _pivotPos = new THREE.Vector3();
const _pivotQuat = new THREE.Quaternion();
const _pivotScale = new THREE.Vector3();
const _pivotWorld = new THREE.Matrix4();
const _coinScale = new THREE.Vector3(1, 1, 1);
const _spawnUp = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _spawnQuat = new THREE.Quaternion();
const _spawnImpulseVec = new THREE.Vector3();
const _spawnImpulse = { x: 0, y: 0, z: 0 };

/**
 * @returns {{ phase: string, angle: number, spin_speed: number, snap_target: number, snap_mark: number }}
 */
function _make_revolver_state() {
	return {
		phase: "idle",
		angle: 0,
		spin_speed: 0,
		snap_target: 0,
		snap_mark: 0,
	};
}

/**
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
function _angle_delta(from, to) {
	let d = to - from;
	const tau = Math.PI * 2;
	while (d > Math.PI) {
		d -= tau;
	}
	while (d < -Math.PI) {
		d += tau;
	}
	return d;
}

/**
 * @param {string[]|string|undefined} patterns
 * @returns {string}
 */
function _parse_revolver_pattern(patterns) {
	if (Array.isArray(patterns) && patterns.length > 0) {
		const raw = patterns[0];
		if (typeof raw === "string" && raw.endsWith("*")) {
			return raw.slice(0, -1);
		}
		return raw;
	}
	return DEFAULT_REVOLVER_PATTERN.slice(0, -1);
}

/**
 * @param {{ sizeX: number, sizeY: number, sizeZ: number }} bounds
 * @returns {number}
 */
function _upper_face_span(bounds) {
	return Math.max(bounds.sizeX, bounds.sizeZ);
}

/**
 * @param {{ sizeX: number, sizeY: number, sizeZ: number }} bounds
 * @returns {number}
 */
function _drum_radius_from_bounds(bounds) {
	return Math.max(bounds.sizeY, bounds.sizeZ) * 0.5;
}

/**
 * @param {import("../core/core.js").default} core
 * @param {string} modelKey
 * @param {string} [objectName]
 * @returns {{ sizeX: number, sizeY: number, sizeZ: number }|null}
 */
function _resolve_model_bounds(core, modelKey, objectName) {
	const modelconf = core.db.get("models")?.getconfig(modelKey);
	if (!modelconf) {
		return null;
	}

	if (modelconf.type === "box") {
		return {
			sizeX: modelconf.w ?? 1,
			sizeY: modelconf.h ?? 1,
			sizeZ: modelconf.d ?? 1,
		};
	}

	const sourceKey = modelconf.source;
	const objectKey = objectName ?? modelconf.object;
	if (!sourceKey || !objectKey) {
		return null;
	}

	const gltf = core.assets.file(sourceKey);
	const root = gltf?.scene;
	if (!root) {
		return null;
	}

	root.updateMatrixWorld(true);
	_bbox.makeEmpty();
	const object = root.getObjectByName(objectKey);
	if (object) {
		object.traverse((node) => {
			/** @type {THREE.Mesh} */
			const mesh = /** @type {any} */ (node);
			if (!mesh.isMesh || !mesh.geometry) {
				return;
			}
			if (!mesh.geometry.boundingBox) {
				mesh.geometry.computeBoundingBox();
			}
			if (!mesh.geometry.boundingBox) {
				return;
			}
			const part = mesh.geometry.boundingBox.clone();
			part.applyMatrix4(mesh.matrixWorld);
			_bbox.union(part);
		});
	}

	if (_bbox.isEmpty()) {
		return null;
	}

	_bbox.getSize(_size);
	return { sizeX: _size.x, sizeY: _size.y, sizeZ: _size.z };
}

/**
 * @param {import("../core/core.js").default} core
 * @param {string} toyKey
 * @returns {string|null}
 */
function _resolve_toy_mesh_key(core, toyKey) {
	const toyconf = core.db.get("toys")?.getconfig(toyKey);
	if (!toyconf?.item) {
		return null;
	}
	const itemconf = core.db.get("items")?.getconfig(toyconf.item);
	return itemconf?.mesh ?? null;
}

/**
 * @param {number} drumRadius
 * @param {{ sizeX: number, sizeY: number, sizeZ: number }} drumBounds
 * @param {number} faceCount
 * @param {string[]} faceToys
 * @param {import("../core/core.js").default} core
 * @returns {number}
 */
function _compute_coin_fit_scale(drumRadius, drumBounds, faceCount, faceToys, core) {
	if (!drumBounds || faceCount < 1 || drumRadius <= 1e-6) {
		return 1;
	}
	const segment = (Math.PI * 2) / faceCount;
	const chord = 2 * drumRadius * Math.sin(segment * 0.5);
	const drumDepth = Math.min(drumBounds.sizeY, drumBounds.sizeZ);
	let scale = 1;
	const n = Math.min(faceCount, faceToys.length);
	for (let i = 0; i < n; i++) {
		const meshKey = _resolve_toy_mesh_key(core, faceToys[i]);
		const bounds = meshKey ? _resolve_model_bounds(core, meshKey) : null;
		if (!bounds) {
			continue;
		}
		const width = _upper_face_span(bounds);
		if (width > 1e-6) {
			scale = Math.min(scale, chord / width);
		}
		if (bounds.sizeY > 1e-6) {
			scale = Math.min(scale, drumDepth / bounds.sizeY);
		}
	}
	return Math.min(1, Math.max(scale, 0.01));
}

/**
 * @param {number} angle
 * @param {number} segment
 * @param {number} faceCount
 * @returns {number}
 */
function _face_index_from_angle(angle, segment, faceCount) {
	let idx = Math.round(-angle / segment) % faceCount;
	idx = ((idx % faceCount) + faceCount) % faceCount;
	return idx;
}

/**
 * @param {number} matchCount
 * @returns {number}
 */
function _match_spawn_count(matchCount) {
	if (matchCount >= 3) {
		return 4;
	}
	if (matchCount >= 2) {
		return 2;
	}
	return 0;
}

/**
 * @param {number} angle
 * @param {number} segment
 * @returns {number}
 */
function _snap_mark_from_angle(angle, segment) {
	return Math.floor(angle / segment);
}

/**
 * @returns {{ toyIndex: number, toyKey: string, total: number, spawned: number, timer: number }}
 */
function _make_reward_spawn_state() {
	return {
		toyIndex: -1,
		toyKey: "",
		total: 0,
		spawned: 0,
		timer: 0,
	};
}

/**
 * @class ArcadeToyArcaderA
 * @memberof pb.play
 */
class ArcadeToyArcaderA {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		this._core = core;
	}

	/**
	 * @param {Record<string, any>} conf
	 * @returns {boolean}
	 */
	static matches(conf) {
		const id = conf?.id;
		return id === ARCADER_A_TOY_DB_ID;
	}

	/**
	 * @returns {boolean}
	 */
	_any_revolver_active() {
		for (let i = 0; i < this._revolvers.length; i++) {
			if (this._revolvers[i].phase !== "idle") {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param {number} toyIndex
	 * @param {string|null} toyDbKey
	 * @returns {void}
	 */
	init(toyIndex, toyDbKey) {
		// 2026-06-30, Composer: per-arcader revolver state on toy init [pltoy6]
		this._root_index = toyIndex;
		this._root_name = toyDbKey;
		this._cycle_active = false;
		this._next_stop = 0;
		this._revolver_pivots = [];
		this._revolvers = [];
		this._coins = [];
		this._segment = (Math.PI * 2) / 5;
		this._face_count = 0;
		this._coin_scale = 1;
		this._face_toys = [];
		this._dispenser_slot = null;
		this._reward_spawn = _make_reward_spawn_state();
		this._toy_db_key = toyDbKey;
		this._setup_from_arcade_db(toyIndex, toyDbKey);
	}

	/**
	 * @param {string|null} toyDbKey
	 * @returns {Record<string, any>|null}
	 */
	_get_arcade_conf(toyDbKey) {
		const arcade = this._core.db.get("arcade");
		if (!arcade) {
			return null;
		}
		return (
			(toyDbKey ? arcade.getconfig(toyDbKey) : null) ??
			arcade.getconfig(ARCADER_A_ARCADE_KEY)
		);
	}

	/**
	 * @param {import("../scene/rigid_model.js").default|null} rigid
	 * @param {string} prefix
	 * @returns {string[]}
	 */
	_match_revolver_pivots(rigid, prefix) {
		if (!rigid?.parts) {
			return [];
		}
		const pivots = [];
		rigid.parts.forEach((_part, name) => {
			if (name.startsWith(prefix)) {
				pivots.push(name);
			}
		});
		pivots.sort();
		return pivots;
	}

	/**
	 * @param {number} toyIndex
	 * @param {string|null} toyDbKey
	 * @returns {void}
	 */
	_setup_from_arcade_db(toyIndex, toyDbKey) {
		if (this._revolver_pivots.length) {
			return;
		}

		const rigid = this._resolve_rigid(toyIndex);
		if (!rigid) {
			return;
		}

		const arcadeConf = this._get_arcade_conf(toyDbKey);
		this._dispenser_slot = arcadeConf?.dispenser_slot ?? null;
		const prefix = _parse_revolver_pattern(arcadeConf?.revolvers);
		this._revolver_pivots = this._match_revolver_pivots(rigid, prefix);
		if (!this._revolver_pivots.length) {
			return;
		}

		/** @type {string[]} */
		const faceToys = Array.isArray(arcadeConf?.revolver_slots)
			? arcadeConf.revolver_slots.slice()
			: [];
		const cap = arcadeConf?.revolver_size ?? faceToys.length;
		if (!faceToys.length) {
			return;
		}

		const drumPivot = this._revolver_pivots[0];
		const drumBounds = _resolve_model_bounds(
			this._core,
			ARCADER_A_MODEL_KEY,
			drumPivot,
		);
		const drumRadius = drumBounds ? _drum_radius_from_bounds(drumBounds) : 0.5;

		this._face_count = Math.min(cap, faceToys.length);
		if (this._face_count < 1) {
			return;
		}
		this._face_toys = faceToys.slice(0, this._face_count);
		this._segment = (Math.PI * 2) / this._face_count;
		// 2026-06-30, Composer: uniform coin scale from drum vs bounds fit [pltoy19]
		this._coin_scale = drumBounds
			? _compute_coin_fit_scale(
					drumRadius,
					drumBounds,
					this._face_count,
					faceToys,
					this._core,
				)
			: 1;

		this._revolvers.length = 0;
		for (let i = 0; i < this._revolver_pivots.length; i++) {
			this._revolvers.push(_make_revolver_state());
		}

		this._attach_revolver_coins(
			rigid,
			this._face_toys,
			drumRadius,
			drumBounds,
		);
	}

	/**
	 * @param {import("../scene/rigid_model.js").default} rigid
	 * @param {string[]} faceToys
	 * @param {number} drumRadius
	 * @param {{ sizeX: number, sizeY: number, sizeZ: number }} drumBounds
	 * @returns {void}
	 */
	_attach_revolver_coins(rigid, faceToys, drumRadius, drumBounds) {
		// 2026-06-30, Composer: visual coin instances driven via setMatrixAt [pltoy17]
		const drumDepth = Math.min(drumBounds.sizeY, drumBounds.sizeZ);
		// 2026-07-01, GPT-5.5: revolver face models use center radius [pltoy24]
		const placeRadius = Math.max(
			drumRadius,
			drumDepth * 0.25,
		);

		this._coins.length = 0;
		for (let r = 0; r < this._revolver_pivots.length; r++) {
			/** @type {{ entity: import("@three.ez/instanced-mesh").InstancedEntity, faceIndex: number, radius: number, inset: number }[]} */
			const layer = [];
			for (let f = 0; f < this._face_count; f++) {
				const toyKey = faceToys[f];
				const meshKey = _resolve_toy_mesh_key(this._core, toyKey);
				if (!meshKey) {
					continue;
				}
				const entity = this._core.scene.model(meshKey);
				if (!entity) {
					continue;
				}
				const bounds = _resolve_model_bounds(this._core, meshKey);
				// 2026-07-01, GPT-5.5: revolver face models inset by half height [pltoy25]
				const inset = ((bounds?.sizeY ?? 0) * this._coin_scale) * 0.5;
				layer.push({
					entity,
					faceIndex: f,
					radius: placeRadius,
					inset,
				});
			}
			this._coins.push(layer);
		}

		this._sync_coin_faces(rigid);
	}

	/**
	 * @returns {boolean}
	 */
	_reward_active() {
		const reward = this._reward_spawn;
		return reward != null && reward.spawned < reward.total;
	}

	/**
	 * @param {number} _toyIndex
	 * @returns {void}
	 */
	dispose(_toyIndex) {
		for (let r = 0; r < this._coins.length; r++) {
			const layer = this._coins[r];
			for (let c = 0; c < layer.length; c++) {
				layer[c].entity?.remove();
			}
		}
		this._coins.length = 0;
		this._cycle_active = false;
		this._next_stop = 0;
		this._revolvers.length = 0;
		this._revolver_pivots.length = 0;
		this._face_toys = [];
		this._dispenser_slot = null;
		this._reward_spawn = _make_reward_spawn_state();
		this._toy_db_key = null;
	}

	/**
	 * @param {number} dt
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	update(dt, toyIndex) {
		if (!this._revolver_pivots.length && this._toy_db_key != null) {
			this._setup_from_arcade_db(toyIndex, this._toy_db_key);
		}

		const rigid = this._resolve_rigid(toyIndex);
		if (!rigid) {
			return;
		}

		if (this._cycle_active || this._any_revolver_active()) {
			let active = false;
			for (let i = 0; i < this._revolvers.length; i++) {
				if (this._update_revolver(dt, rigid, this._revolvers[i], i)) {
					active = true;
				}
			}

			if (
				!active &&
				this._cycle_active &&
				this._next_stop >= this._revolvers.length
			) {
				this._cycle_active = false;
				this._on_all_revolvers_stopped(toyIndex);
			}
		}

		if (this._coins.length) {
			this._sync_coin_faces(rigid);
		}

		this._update_reward_spawn(dt);
	}

	/**
	 * @param {import("../scene/rigid_model.js").default} rigid
	 * @returns {void}
	 */
	_sync_coin_faces(rigid) {
		for (let r = 0; r < this._revolver_pivots.length; r++) {
			const pivot = rigid.getSlot(this._revolver_pivots[r]);
			const layer = this._coins[r];
			if (!pivot || !layer?.length) {
				continue;
			}

			pivot.rotation.x = this._revolvers[r].angle;
			pivot.updateMatrixWorld(true);

			for (let c = 0; c < layer.length; c++) {
				const coin = layer[c];
				const entity = coin.entity;
				const owner = entity.owner;
				if (!owner) {
					continue;
				}

				const theta = coin.faceIndex * this._segment;
				const radius = Math.max(0, coin.radius - coin.inset);
				_facePos.set(
					0,
					radius * Math.cos(theta),
					radius * Math.sin(theta),
				);
				_radial.copy(_facePos).normalize();
				_faceQuat.setFromUnitVectors(_yUp, _radial);
				_coinScale.set(this._coin_scale, this._coin_scale, this._coin_scale);
				_faceLocal.compose(_facePos, _faceQuat, _coinScale);
				// 2026-06-30, Composer: coin sync ignores pivot non-uniform scale [pltoy18]
				pivot.matrixWorld.decompose(_pivotPos, _pivotQuat, _pivotScale);
				_pivotWorld.compose(_pivotPos, _pivotQuat, _unitScale);
				_worldMat.multiplyMatrices(_pivotWorld, _faceLocal);
				owner.updateMatrixWorld(true);
				_localMat
					.copy(_worldMat)
					.premultiply(_ownerInv.copy(owner.matrixWorld).invert());
				owner.setMatrixAt(entity.id, _localMat);
			}
		}
	}

	/**
	 * @param {number} rootIndex
	 * @param {string} buttonEvent
	 * @param {string|null} rootName
	 * @returns {void}
	 */
	on_button(rootIndex, buttonEvent, rootName) {
		// 2026-06-30, Composer: arcader_a button_event switch dispatch [pltoy2]
		switch (buttonEvent) {
			case "btn_a":
				this._btn_a(rootIndex, rootName);
				break;
		}
	}

	/**
	 * @param {number} rootIndex
	 * @param {string|null} rootName
	 * @returns {void}
	 */
	_btn_a(rootIndex, rootName) {
		if (this._reward_active()) {
			return;
		}
		if (!this._cycle_active) {
			if (this._any_revolver_active() || this._revolvers.length === 0) {
				return;
			}
			this._root_name = rootName;
			this._core.toybox.blackboard.write(
				rootIndex,
				BB_KEY_PLAY,
				VAR_PLAY_ARCADER_DONE,
				0,
			);
			this._cycle_active = true;
			this._next_stop = 0;
			for (let i = 0; i < this._revolvers.length; i++) {
				this._start_spin(this._revolvers[i], SPIN_SPEED);
			}
			return;
		}

		// 2026-06-30, Composer: each click stops next revolver in order [pltoy14]
		if (this._next_stop >= this._revolvers.length) {
			return;
		}
		this._request_stop(this._revolvers[this._next_stop]);
		this._next_stop++;
	}

	/**
	 * @param {number} toyIndex
	 * @returns {import("../scene/rigid_model.js").default|null}
	 */
	_resolve_rigid(toyIndex) {
		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const model = this._core.scene.get_itemmodel(itemIndex);
		if (!model?.isRigidModel) {
			return null;
		}
		return model;
	}

	/**
	 * @param {{ phase: string, angle: number, spin_speed: number, snap_target: number, snap_mark: number }} state
	 * @param {number} spinSpeed
	 * @returns {void}
	 */
	_start_spin(state, spinSpeed) {
		state.phase = "spin";
		state.spin_speed = spinSpeed;
		state.snap_mark = _snap_mark_from_angle(state.angle, this._segment);
	}

	/**
	 * @param {{ phase: string, angle: number, spin_speed: number, snap_target: number, snap_mark: number }} state
	 * @returns {void}
	 */
	_request_stop(state) {
		if (state.phase !== "spin") {
			return;
		}
		state.phase = "snap";
		state.snap_target =
			Math.round(state.angle / this._segment) * this._segment;
	}

	/**
	 * @param {number} dt
	 * @param {import("../scene/rigid_model.js").default} rigid
	 * @param {{ phase: string, angle: number, spin_speed: number, snap_target: number, snap_mark: number }} state
	 * @param {number} index
	 * @returns {boolean}
	 */
	_update_revolver(dt, rigid, state, index) {
		const pivot = rigid.getSlot(this._revolver_pivots[index]);
		if (!pivot) {
			return state.phase !== "idle";
		}

		if (state.phase === "spin") {
			state.angle += state.spin_speed * dt;
			const snapMark = _snap_mark_from_angle(state.angle, this._segment);
			if (snapMark !== state.snap_mark) {
				state.snap_mark = snapMark;
				this._core.scene.audio.play(SFX_REVOLVER_PASS);
			}
			// 2026-06-30, Composer: revolver spin on local x axis [pltoy10]
			pivot.rotation.x = state.angle;
			return true;
		}

		if (state.phase === "snap") {
			const delta = _angle_delta(state.angle, state.snap_target);
			if (Math.abs(delta) <= SNAP_DONE_EPS) {
				state.angle = state.snap_target;
				pivot.rotation.x = state.angle;
				state.phase = "idle";
				this._core.scene.audio.play(SFX_REVOLVER_STOP);
				return false;
			}
			const step = Math.sign(delta) * Math.min(Math.abs(delta), SNAP_RATE * dt);
			state.angle += step;
			pivot.rotation.x = state.angle;
			return true;
		}

		return false;
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_all_revolvers_stopped(toyIndex) {
		this._core.toybox.blackboard.write(
			toyIndex,
			BB_KEY_PLAY,
			VAR_PLAY_ARCADER_DONE,
			1,
		);
		// 2026-06-30, Composer: sequential match reward spawn with delay state [pltoy21]
// 2026-06-30, Composer: any adjacent revolver run match impulse by mass [pltoy22]
		const reward = this._evaluate_match_reward();
		if (reward) {
			this._begin_reward_spawn(toyIndex, reward.toyKey, reward.spawnCount);
		}
	}

	/**
	 * @returns {string[]}
	 */
	_stopped_face_toys() {
		/** @type {string[]} */
		const keys = [];
		for (let i = 0; i < this._revolvers.length; i++) {
			const faceIndex = _face_index_from_angle(
				this._revolvers[i].angle,
				this._segment,
				this._face_count,
			);
			const toyKey = this._face_toys[faceIndex];
			keys.push(toyKey ?? "");
		}
		return keys;
	}

	/**
	 * @returns {{ toyKey: string, spawnCount: number, matchCount: number }|null}
	 */
	_evaluate_match_reward() {
		const keys = this._stopped_face_toys();
		if (keys.length < 2) {
			return null;
		}

		// 2026-06-30, Composer: any adjacent revolver run counts as match [pltoy22]
		let bestKey = null;
		let bestCount = 0;
		let runStart = 0;
		while (runStart < keys.length) {
			const key = keys[runStart];
			if (!key) {
				runStart++;
				continue;
			}
			let runCount = 1;
			let i = runStart + 1;
			while (i < keys.length && keys[i] === key) {
				runCount++;
				i++;
			}
			if (runCount > bestCount) {
				bestCount = runCount;
				bestKey = key;
			}
			runStart = i;
		}

		const spawnCount = _match_spawn_count(bestCount);
		if (!bestKey || spawnCount < 1) {
			return null;
		}
		return { toyKey: bestKey, spawnCount, matchCount: bestCount };
	}

	/**
	 * @param {number} toyIndex
	 * @param {string} toyKey
	 * @param {number} count
	 * @returns {void}
	 */
	_begin_reward_spawn(toyIndex, toyKey, count) {
		this._reward_spawn = {
			toyIndex,
			toyKey,
			total: count,
			spawned: 0,
			timer: 0,
		};
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	_update_reward_spawn(dt) {
		const reward = this._reward_spawn;
		if (!reward || reward.spawned >= reward.total) {
			return;
		}

		reward.timer -= dt;
		if (reward.timer > 0) {
			return;
		}

		this._spawn_one_match_reward(
			reward.toyIndex,
			reward.toyKey,
			reward.spawned,
			reward.total,
		);
		reward.spawned++;
		reward.timer = MATCH_SPAWN_DELAY;

		if (reward.spawned >= reward.total) {
			console.log(
				"arcader_a",
				"match_reward",
				this._root_name,
				reward.toyKey,
				reward.total,
			);
			this._reward_spawn = _make_reward_spawn_state();
		}
	}

	/**
	 * @param {number} toyIndex
	 * @param {string} toyKey
	 * @param {number} index
	 * @param {number} count
	 * @returns {void}
	 */
	_spawn_one_match_reward(toyIndex, toyKey, index, count) {
		const itemIndex = this._core.toybox.get_item_index(toyIndex);
		const body = this._core.scene.get_itembody(itemIndex);
		const rigid = this._resolve_rigid(toyIndex);
		if (!body || !rigid) {
			return;
		}

		// 2026-07-01, GPT-5.5: reward spawn uses dispenser slot transform [plvfx8]
		rigid.root.updateMatrixWorld(true);
		const dispenser = this._dispenser_slot
			? rigid.getSlot(this._dispenser_slot)
			: null;
		const spawnSlot = dispenser ?? rigid.root;
		spawnSlot.getWorldPosition(_spawnPos);
		spawnSlot.getWorldQuaternion(_spawnQuat);
		_spawnUp.set(0, 1, 0).applyQuaternion(_spawnQuat);

		const spawned = this._core.toybox.spawn(toyKey, true);
		if (spawned == null) {
			return;
		}
		this._core.scene.audio.play(SFX_REWARD_SPAWN);
		const spawnedItem = this._core.toybox.get_item_index(spawned);
		const spread = (index - (count - 1) * 0.5) * MATCH_SPAWN_SPREAD;
		const x = _spawnPos.x + _spawnUp.x * spread;
		const y = _spawnPos.y + _spawnUp.y * spread;
		const z = _spawnPos.z + _spawnUp.z * spread;
		this._core.scene.set_itemposition(
			spawnedItem,
			x,
			y,
			z,
		);
		// 2026-07-01, GPT-5.5: reward spawn position event for flick vfx [plvfx3]
		// 2026-07-01, GPT-5.5: reward event includes toy for arcade cleanup [plcln2]
		this._core.eventsbus.emit("arcade.reward_spawn", {
			toyIndex: spawned,
			x,
			y,
			z,
		});

		const spawnBody = this._core.scene.get_itembody(spawnedItem);
		if (!spawnBody) {
			return;
		}
		spawnBody.wakeUp();
		const mass = Math.max(spawnBody.mass(), 0.01);
		// 2026-06-30, Composer: match spawn impulse scales with body mass [pltoy22]
		const impulseMag = MATCH_SPAWN_IMPULSE * mass;
		// 2026-07-01, GPT-5.5: dispenser impulse uses local Y+ [plvfx9]
		_spawnImpulseVec
			.set(
				(Math.random() - 0.5) * 0.08,
				impulseMag,
				impulseMag * 0.25,
			)
			.applyQuaternion(_spawnQuat);
		_spawnImpulse.x = _spawnImpulseVec.x;
		_spawnImpulse.y = _spawnImpulseVec.y;
		_spawnImpulse.z = _spawnImpulseVec.z;
		spawnBody.applyImpulse(_spawnImpulse, true);
	}
}

/**
 * @class ArcadeToys
 * @memberof pb.play
 */
class ArcadeToys {
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
		/** @type {number|null} */
		this._toy_init_id = null;
		/** @type {number|null} */
		this._toy_dis_id = null;
		/** @type {number|null} */
		this._click_id = null;
		/** @type {Map<number, ArcadeToyArcaderA>} */
		this._by_root = new Map();
		/** @type {Record<number, string>} */
		this._toy_key_by_id = {};
		this._build_toy_key_by_id();
		return this;
	}

	/** @returns {void} */
	start() {
		this._toy_init_id = this._core.eventsbus.on(
			"toy.initialize",
			this._on_toy_init.bind(this),
		);
		this._toy_dis_id = this._core.eventsbus.on(
			"toy.dispose",
			this._on_toy_dispose.bind(this),
		);
		this._click_id = this._core.eventsbus.on(
			"arcade.click",
			// 2026-07-01, Composer: button dispatch via arcade.click [pltoy23]
			this._on_arcade_click.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._toy_init_id != null) {
			this._core.eventsbus.off(this._toy_init_id);
			this._toy_init_id = null;
		}
		if (this._toy_dis_id != null) {
			this._core.eventsbus.off(this._toy_dis_id);
			this._toy_dis_id = null;
		}
		if (this._click_id != null) {
			this._core.eventsbus.off(this._click_id);
			this._click_id = null;
		}
		// 2026-07-01, GPT-5.5: dispose toy handlers on arcade stop [plcln3]
		this._by_root.forEach((inst, toyIndex) => {
			inst.dispose(toyIndex);
		});
		this._by_root.clear();
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/**
	 * @param {number} dt
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	toyupdate(dt, toyIndex) {
		this._by_root.get(toyIndex)?.update(dt, toyIndex);
	}

	/** @returns {void} */
	_build_toy_key_by_id() {
		// 2026-06-30, Composer: toy db id to key map for root name logs [pltoy1]
		this._toy_key_by_id = {};
		const entry = this._core.db.get("toys");
		if (!entry) {
			return;
		}
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (conf?.id != null) {
				this._toy_key_by_id[conf.id] = key;
			}
		}
	}

	/**
	 * @param {number} toyIndex
	 * @returns {string|null}
	 */
	_toy_db_key(toyIndex) {
		const conf = this._core.toybox.get_toyconf(toyIndex);
		if (conf?.id == null) {
			return null;
		}
		return this._toy_key_by_id[conf.id] ?? null;
	}

	/**
	 * @param {Record<string, any>} conf
	 * @returns {typeof ArcadeToyArcaderA|null}
	 */
	_handler_type_for(conf) {
		if (ArcadeToyArcaderA.matches(conf)) {
			return ArcadeToyArcaderA;
		}
		return null;
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_toy_init(toyIndex) {
		const { toybox } = this._core;
		if (toybox.modulebox.welds.is_member(toyIndex)) {
			return;
		}
		const conf = toybox.get_toyconf(toyIndex);
		const Handler = this._handler_type_for(conf);
		if (!Handler) {
			return;
		}
		const inst = new Handler(this._core);
		inst.init(toyIndex, this._toy_db_key(toyIndex));
		this._by_root.set(toyIndex, inst);
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_toy_dispose(toyIndex) {
		const inst = this._by_root.get(toyIndex);
		if (!inst) {
			return;
		}
		inst.dispose(toyIndex);
		this._by_root.delete(toyIndex);
	}

	/**
	 * @param {{ itemIndex: number, x: number, y: number, z: number }} payload
	 * @returns {void}
	 */
	_on_arcade_click({ itemIndex }) {
		const { itembox, toybox } = this._core;
		const toyIndex = itembox.mempool.read_ui16(itemIndex, VAR_TOY_INDEX);
		if (toyIndex === TOY_INDEX_INVALID || !toybox.has_tag(toyIndex, "button")) {
			return;
		}

		const welds = toybox.modulebox.welds;
		const rootIndex = welds.is_member(toyIndex)
			? welds.get_parent(toyIndex)
			: toyIndex;
		const rootConf = toybox.get_toyconf(rootIndex);
		const Handler = this._handler_type_for(rootConf);
		if (!Handler) {
			return;
		}

		const inst = this._by_root.get(rootIndex);
		if (!inst) {
			return;
		}

		const buttonEvent = toybox.get_toyconf(toyIndex)?.button;
		if (buttonEvent == null) {
			return;
		}

		inst.on_button(rootIndex, buttonEvent, this._toy_db_key(rootIndex));
	}
}

export default ArcadeToys;
export { ArcadeToyArcaderA };
// 2026-06-30, Composer: arcade per-toy handler registry [pltoy3]
// 2026-06-30, Composer: toy db id to key map for root name logs [pltoy1]
// 2026-06-30, Composer: arcader_a button_event switch dispatch [pltoy2]
// 2026-06-30, Composer: per-arcader revolver state on toy init [pltoy6]
// 2026-06-30, Composer: revolver spin on local x axis [pltoy10]
// 2026-06-30, Composer: fixed positive x spin direction [pltoy12]
// 2026-06-30, Composer: each click stops next revolver in order [pltoy14]
// 2026-06-30, Composer: visual coin instances driven via setMatrixAt [pltoy17]
// 2026-06-30, Composer: coin sync ignores pivot non-uniform scale [pltoy18]
// 2026-06-30, Composer: uniform coin scale from drum vs bounds fit [pltoy19]
// 2026-06-30, Composer: spawn matched face toys right of arcader bounds [pltoy20]
// 2026-06-30, Composer: sequential match reward spawn with delay state [pltoy21]
// 2026-06-30, Composer: any adjacent revolver run match impulse by mass [pltoy22]
// 2026-07-01, Composer: button dispatch via arcade.click [pltoy23]
// 2026-07-01, GPT-5.5: arcader revolver and reward sfx [plsfx5]
// 2026-07-01, GPT-5.5: reward spawn position event for flick vfx [plvfx3]
// 2026-07-01, GPT-5.5: reward spawn uses dispenser slot transform [plvfx8]
// 2026-07-01, GPT-5.5: dispenser impulse uses local Y+ [plvfx9]
// 2026-07-01, GPT-5.5: reward event includes toy for arcade cleanup [plcln2]
// 2026-07-01, GPT-5.5: dispose toy handlers on arcade stop [plcln3]
// 2026-07-01, GPT-5.5: revolver face models use center radius [pltoy24]
// 2026-07-01, GPT-5.5: revolver face models inset by half height [pltoy25]
