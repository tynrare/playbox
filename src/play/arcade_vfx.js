/** @namespace ty */
// Purpose: lightweight arcade reward flick particles backed by Mempool slots.
// 2026-07-01, GPT-5.5: arcade reward flick vfx mempool [plvfx1]

import * as THREE from "three";
import Mempool, {
	VAR_FLAG_ACTIVE,
	VAR_FLAGS_A,
} from "../core/mempool.js";
// 2026-07-01, GPT-5.5: shared nmap import for flick curve [plvfx7]
import { cache, nmap } from "../math.js";
import { DitheredOpacity } from "../render/materials/DitheredOpacity.js";
import { ExtendedMaterial } from "../render/materials/ExtendedMaterial.js";

const FLICK_MESH_KEY = "arcade_vfx_flick";
const FLICK_CAPACITY = 96;
const FLICK_COUNT = 8;
const FLICK_COLOR = 0xffcc22;
const FLICK_LIFE = 0.42;
const FLICK_SIZE = 0.5;
const FLICK_VELOCITY = 0;
const FLICK_GLOW = 10;
const PARTICLE_BYTES = 24;
// 2026-07-01, GPT-5.5: encoded direction plus velocity fields [plvfx5]
const VAR_DIR_X = 3;
const VAR_DIR_Y = 4;
const VAR_DIR_Z = 5;
const VAR_VELOCITY = 6;
const VAR_ELAPSED = 7;
const VAR_LIFE = 8;
const VAR_SIZE = 9;
const VAR_OPACITY = 10;

const _dir = new THREE.Vector3();

/**
 * @class ArcadeVfx
 * @memberof pb.play
 */
class ArcadeVfx {
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
		this._pool = new Mempool().init(PARTICLE_BYTES, FLICK_CAPACITY);
		/** @type {(import("@three.ez/instanced-mesh").InstancedEntity|null)[]} */
		this._entities = new Array(FLICK_CAPACITY).fill(null);
		/** @type {number|null} */
		this._reward_spawn_id = null;
		return this;
	}

	/** @returns {void} */
	start() {
		this._init_mesh();
		this._reward_spawn_id = this._core.eventsbus.on(
			"arcade.reward_spawn",
			this._on_reward_spawn.bind(this),
		);
	}

	/** @returns {void} */
	stop() {
		if (this._reward_spawn_id != null) {
			this._core.eventsbus.off(this._reward_spawn_id);
			this._reward_spawn_id = null;
		}
		this._clear_particles();
		this._core.draw.core?.delimesh(FLICK_MESH_KEY, true);
	}

	/** @returns {void} */
	dispose() {
		this.stop();
		this._pool.dispose();
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	step(dt) {
		const pool = this._pool;
		const taken = pool.tankenlist;
		if (!taken) {
			return;
		}
		for (let i = pool.takencount - 1; i >= 0; i--) {
			this._step_particle(taken[i], dt);
		}
		this._core.draw.core?.getimesh(FLICK_MESH_KEY)?.computeBoundingSphere();
	}

	/** @returns {void} */
	_init_mesh() {
		const drawcore = this._core.draw.core;
		if (!drawcore || drawcore.getimesh(FLICK_MESH_KEY)) {
			return;
		}
		const material = new ExtendedMaterial(
			THREE.MeshLambertMaterial,
			[DitheredOpacity],
			{
				color: 0xffffff,
				emissive: 0xffffff,
				emissiveIntensity: 1,
				opacity: 1,
				transparent: true,
				depthWrite: false,
			},
		);
		const geometry = new THREE.IcosahedronGeometry(1, 1);
		drawcore.initimesh(FLICK_MESH_KEY, geometry, material, {
			capacity: FLICK_CAPACITY,
			culling: false,
			castShadow: false,
			receiveShadow: false,
			renderer: this._core.render.renderer,
		});
		drawcore.inituniforms(FLICK_MESH_KEY, {
			emissive: "vec3",
			opacity: "float",
		});
	}

	/** @returns {void} */
	_clear_particles() {
		const pool = this._pool;
		const taken = pool.tankenlist;
		if (!taken) {
			return;
		}
		while (pool.takencount > 0) {
			this._free_particle(taken[pool.takencount - 1]);
		}
	}

	/**
	 * @param {{ x: number, y: number, z: number }} pos
	 * @returns {void}
	 */
	_on_reward_spawn(pos) {
		for (let i = 0; i < FLICK_COUNT; i++) {
			this.spawn_flick(pos.x, pos.y, pos.z);
		}
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @returns {void}
	 */
	spawn_flick(x, y, z) {
		const drawcore = this._core.draw.core;
		if (!drawcore) {
			return;
		}
		const index = this._pool.allocate();
		if (index == null) {
			return;
		}
		const entity = drawcore.makemesh(FLICK_MESH_KEY);
		if (!entity) {
			this._pool.free(index);
			return;
		}

		// 2026-07-01, GPT-5.5: arcade reward flick vfx mempool [plvfx1]
		const spread = 0.5;
		entity.position.set(
			x + (Math.random() - 0.5) * 0.12,
			y + (Math.random() - 0.5) * 0.12,
			z + (Math.random() - 0.5) * 0.12,
		);
		// 2026-07-01, GPT-5.5: encoded direction plus velocity fields [plvfx5]
		_dir.set(
			(Math.random() - 0.5) * spread,
			0.45 + Math.random() * 0.5,
			(Math.random() - 0.5) * spread,
		).normalize();
		this._write_dir(index, _dir);
		this._entities[index] = entity;
		this._pool.write_float(index, VAR_VELOCITY, (0.5 + Math.random() * 0.5) * FLICK_VELOCITY);
		this._pool.write_float(index, VAR_ELAPSED, 0);
		this._pool.write_float(index, VAR_LIFE, FLICK_LIFE);
		this._pool.write_float(index, VAR_SIZE, FLICK_SIZE);
		this._pool.write_float(index, VAR_OPACITY, 1);
		this._apply_particle(index, 0);
	}

	/**
	 * @param {number} index
	 * @param {THREE.Vector3} dir
	 * @returns {void}
	 */
	_write_dir(index, dir) {
		this._pool.write_float(index, VAR_DIR_X, dir.x * 0.5 + 0.5);
		this._pool.write_float(index, VAR_DIR_Y, dir.y * 0.5 + 0.5);
		this._pool.write_float(index, VAR_DIR_Z, dir.z * 0.5 + 0.5);
	}

	/**
	 * @param {number} index
	 * @param {THREE.Vector3} out
	 * @returns {THREE.Vector3}
	 */
	_read_dir(index, out) {
		return out.set(
			this._pool.read_float(index, VAR_DIR_X) * 2 - 1,
			this._pool.read_float(index, VAR_DIR_Y) * 2 - 1,
			this._pool.read_float(index, VAR_DIR_Z) * 2 - 1,
		).normalize();
	}

	/**
	 * @param {number} index
	 * @param {number} dt
	 * @returns {void}
	 */
	_step_particle(index, dt) {
		const elapsed = this._pool.read_float(index, VAR_ELAPSED) + dt;
		const life = this._pool.read_float(index, VAR_LIFE);
		if (elapsed >= life) {
			this._free_particle(index);
			return;
		}
		this._pool.write_float(index, VAR_ELAPSED, elapsed);
		const entity = this._entities[index];
		if (entity) {
			entity.position.addScaledVector(
				this._read_dir(index, _dir),
				this._pool.read_float(index, VAR_VELOCITY) * dt,
			);
		}
		this._apply_particle(index, elapsed / life);
	}

	/**
	 * @param {number} index
	 * @param {number} t
	 * @returns {void}
	 */
	_apply_particle(index, t) {
		const entity = this._entities[index];
		if (!entity) {
			return;
		}
		const sizeBase = this._pool.read_float(index, VAR_SIZE);
		const opacityBase = this._pool.read_float(index, VAR_OPACITY);

		// 2026-07-01, GPT-5.5: copied flick onpariclestep curve [plvfx6]
		const sizea = 1 - nmap(0.9, 1.0, Math.pow(t, 2));
		const sizeb =
			(nmap(0.0, 0.6, 1 - Math.pow(1 - t, 4)) * 0.5 + 1) * 0.5;
		const size = sizea * sizeb;
		const opacity = opacityBase * (1 - nmap(0.7, 1.0, t));
		const emissivea = (1 - nmap(0.0, 0.9, t)) * 2;
		const emissiveb = (1 - nmap(0.0, 0.3, t)) * 20 + 1;
		const emissive = emissivea * emissiveb;

		entity.scale.setScalar(sizeBase * size);
		entity.setUniform("opacity", opacity);
		entity.setUniform(
			"emissive",
			cache.color0.setHex(FLICK_COLOR).multiplyScalar(emissive * FLICK_GLOW),
		);
		entity.updateMatrix();
	}

	/**
	 * @param {number} index
	 * @returns {void}
	 */
	_free_particle(index) {
		if (!this._pool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return;
		}
		const entity = this._entities[index];
		if (entity) {
			entity.scale.setScalar(0);
			entity.updateMatrix();
			entity.remove();
			this._entities[index] = null;
		}
		this._pool.free(index);
	}
}

export default ArcadeVfx;
// 2026-07-01, GPT-5.5: arcade reward flick vfx mempool [plvfx1]
// 2026-07-01, GPT-5.5: mempool float fields and fade curves [plvfx4]
// 2026-07-01, GPT-5.5: encoded direction plus velocity fields [plvfx5]
// 2026-07-01, GPT-5.5: copied flick onpariclestep curve [plvfx6]
// 2026-07-01, GPT-5.5: shared nmap import for flick curve [plvfx7]
