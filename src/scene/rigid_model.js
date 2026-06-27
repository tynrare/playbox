// 2026-06-27, Composer: welded multi-part visual root + instanced parts [rgmd1]

import * as THREE from "three";

const _ownerInv = new THREE.Matrix4();
const _localMat = new THREE.Matrix4();

/**
 * @typedef {object} RigidModelPart
 * @property {THREE.Object3D} pivot
 * @property {import("@three.ez/instanced-mesh").InstancedEntity|null} entity
 * @property {import("@three.ez/instanced-mesh").InstancedMesh2|null} owner
 * @property {string} slot
 */

/**
 * @class RigidModel
 * @brief Scene-graph root welded to physics; parts sync to InstancedEntity draw instances.
 */
class RigidModel {
	constructor() {
		this.isRigidModel = true;
		/** @type {string|null} */
		this.modelKey = null;
		/** @type {number} */
		this._activeIdx = -1;
		/** @type {THREE.Group} */
		this.root = new THREE.Group();
		/** @type {RigidModelPart[]} */
		this._parts = [];
		/** @type {number} */
		this._partCount = 0;
		/** @type {Record<string, THREE.Object3D>} */
		this._slots = {};
	}

	/**
	 * @param {string} name
	 * @returns {THREE.Object3D|null}
	 */
	getSlot(name) {
		return this._slots[name] ?? null;
	}

	/**
	 * @param {number} index
	 * @param {string} slot
	 * @param {import("@three.ez/instanced-mesh").InstancedEntity} entity
	 * @param {number} px
	 * @param {number} py
	 * @param {number} pz
	 * @param {number} qx
	 * @param {number} qy
	 * @param {number} qz
	 * @param {number} qw
	 * @param {number} sx
	 * @param {number} sy
	 * @param {number} sz
	 * @returns {void}
	 */
	setPart(
		index,
		slot,
		entity,
		px,
		py,
		pz,
		qx,
		qy,
		qz,
		qw,
		sx,
		sy,
		sz,
	) {
		// 2026-06-27, Composer: reuse pivot shells across pool cycles [rgmd9]
		let part = this._parts[index];
		if (!part) {
			const pivot = new THREE.Object3D();
			part = { pivot, entity: null, owner: null, slot: "" };
			this._parts[index] = part;
			this.root.add(pivot);
		}
		part.slot = slot;
		part.entity = entity;
		part.owner = entity.owner;
		part.pivot.name = slot;
		part.pivot.position.set(px, py, pz);
		part.pivot.quaternion.set(qx, qy, qz, qw);
		part.pivot.scale.set(sx, sy, sz);
		part.pivot.updateMatrix();
		this._slots[slot] = part.pivot;
	}

	/**
	 * @param {number} count
	 * @returns {void}
	 */
	setPartCount(count) {
		this._partCount = count;
	}

	/** @returns {void} */
	resetSlots() {
		for (const k in this._slots) {
			delete this._slots[k];
		}
	}

	/** @returns {void} */
	sync() {
		// 2026-06-27, Composer: indexed sync with cached owner inverse [rgmd9]
		this.root.updateMatrixWorld(true);
		const parts = this._parts;
		const n = this._partCount;
		let lastOwner = null;
		for (let i = 0; i < n; i++) {
			const part = parts[i];
			const owner = part.owner;
			if (!owner || !part.entity) {
				continue;
			}
			if (owner !== lastOwner) {
				owner.updateMatrixWorld(true);
				_ownerInv.copy(owner.matrixWorld).invert();
				lastOwner = owner;
			}
			_localMat.copy(part.pivot.matrixWorld).premultiply(_ownerInv);
			owner.setMatrixAt(part.entity.id, _localMat);
		}
	}

	/** @returns {void} */
	release() {
		const parts = this._parts;
		const n = this._partCount;
		for (let i = 0; i < n; i++) {
			const entity = parts[i]?.entity;
			entity?.remove();
			parts[i].entity = null;
			parts[i].owner = null;
		}
		this._partCount = 0;
		this.resetSlots();
		this.root.removeFromParent();
	}
}

export default RigidModel;
// 2026-06-27, Composer: welded multi-part visual root + instanced parts [rgmd1]
// 2026-06-27, Composer: pivot world to owner-local via setMatrixAt [rgmd6]
// 2026-06-27, Composer: indexed sync with cached owner inverse [rgmd9]
