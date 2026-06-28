// 2026-06-27, Composer: welded multi-part visual root + instanced parts [rgmd1]

import * as THREE from "three";

const _ownerInv = new THREE.Matrix4();
const _localMat = new THREE.Matrix4();

/** @type {RigidModelPart[]} */
const _part_pool = [];

/**
 * @class RigidModelPart
 * @brief Pooled pivot + instanced entity slot for RigidModel.
 */
class RigidModelPart {
	constructor() {
		/** @type {THREE.Object3D} */
		this.pivot = new THREE.Object3D();
		/** @type {import("@three.ez/instanced-mesh").InstancedEntity|null} */
		this.entity = null;
	}

	/**
	 * @param {import("@three.ez/instanced-mesh").InstancedEntity} entity
	 * @returns {RigidModelPart}
	 */
	static acquire(entity) {
		// 2026-06-27, Composer: pooled RigidModelPart for makemodel [rgmd9]
		const part = _part_pool.pop() ?? new RigidModelPart();
		part.entity = entity;
		return part;
	}

	/**
	 * @param {RigidModelPart} part
	 * @returns {void}
	 */
	static release(part) {
		part.entity = null;
		part.pivot.removeFromParent();
		part.pivot.position.set(0, 0, 0);
		part.pivot.quaternion.set(0, 0, 0, 1);
		part.pivot.scale.set(1, 1, 1);
		part.pivot.updateMatrix();
		_part_pool.push(part);
	}
}

/**
 * @class RigidModel
 * @brief Scene-graph root welded to physics; parts sync to InstancedEntity draw instances.
 */
class RigidModel {
	constructor() {
		this.isRigidModel = true;
		/** @type {string|null} */
		this.modelKey = null;
		/** @type {THREE.Group} */
		this.root = new THREE.Group();
		/** @type {Map<string, RigidModelPart>} */
		this.parts = new Map();
	}

	/**
	 * @param {string} name
	 * @returns {THREE.Object3D|null}
	 */
	getSlot(name) {
		return this.parts.get(name)?.pivot ?? null;
	}

	/** @returns {void} */
	sync() {
		// 2026-06-27, Composer: pivot world to owner-local via setMatrixAt [rgmd6]
		this.root.updateMatrixWorld(true);
		// 2026-06-27, Composer: Map.forEach avoids values iterator alloc [rgmd9]
		this.parts.forEach((part) => {
			const entity = part.entity;
			if (!entity) {
				return;
			}
			const owner = entity.owner;
			owner.updateMatrixWorld(true);
			_localMat.copy(part.pivot.matrixWorld).premultiply(
				_ownerInv.copy(owner.matrixWorld).invert(),
			);
			owner.setMatrixAt(entity.id, _localMat);
		});
	}

	/** @returns {void} */
	release() {
		// 2026-06-27, Composer: Map.forEach avoids values iterator alloc [rgmd9]
		this.parts.forEach((part) => {
			part.entity?.remove();
			RigidModelPart.release(part);
		});
		this.parts.clear();
		// 2026-06-27, Composer: release clears root children on pool reuse [rgmd8]
		this.root.clear();
		this.root.removeFromParent();
	}
}

export default RigidModel;
export { RigidModelPart };
// 2026-06-27, Composer: welded multi-part visual root + instanced parts [rgmd1]
// 2026-06-27, Composer: pivot world to owner-local via setMatrixAt [rgmd6]
// 2026-06-27, Composer: release clears root children on pool reuse [rgmd8]
// 2026-06-27, Composer: pooled RigidModelPart for makemodel [rgmd9]
