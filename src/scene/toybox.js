/** @namespace ty */
// 2026-06-14, Composer: toybox spawn body mesh weld pipeline [tbx1]
import logger from "../logger.js";

/**
 * @class Toy
 * @memberof pb.scene
 */
export class Toy {
	/**
	 * @param {string} key
	 * @param {string} bodyKey
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @param {import("@three.ez/instanced-mesh").InstancedEntity|null} entity
	 * @param {import("../core/scene.js").default} scene
	 */
	constructor(key, bodyKey, body, entity, scene) {
		this.key = key;
		this.bodyKey = bodyKey;
		this.body = body;
		this.entity = entity;
		this._scene = scene;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	setPosition(x, y, z) {
		this._scene.setBodyPosition(this.body, x, y, z);
	}
}

/**
 * @class Toybox
 * @memberof pb.scene
 */
class Toybox {
	/**
	 * @param {import("../core/scene.js").default} scene
	 * @param {import("../core/db.js").default} db
	 */
	constructor(scene, db) {
		this._scene = scene;
		this._db = db;
		/** @type {Toy[]} */
		this._toys = [];
	}

	start() {}

	stop() {
		for (const toy of this._toys) {
			this._despawn(toy);
		}
		this._toys.length = 0;
	}

	/**
	 * @param {string} key
	 * @returns {Toy|null}
	 */
	spawn(key) {
		const conf = this._db.get("toys")?.getconfig(key);
		if (!conf) {
			logger.error(`Toybox::spawn "${key}" error: no toy declared`);
			return null;
		}

		const meshKey = conf.mesh;
		const bodyKey = conf.body;
		if (!bodyKey) {
			logger.error(`Toybox::spawn "${key}" error: no body declared`);
			return null;
		}

		// 2026-06-14, Composer: mesh-less spawn body only no weld [flty1]
		let entity = null;
		if (meshKey) {
			const model = this._scene.model(meshKey);
			if (!model?.entity) {
				logger.error(
					`Toybox::spawn "${key}" error: mesh "${meshKey}" failed`,
				);
				return null;
			}
			entity = model.entity;
		}

		// 2026-06-14, Composer: scene owns body pool and physics weld [scnbd2]
		const body = this._scene.makebody(bodyKey);
		if (!body) {
			return null;
		}

		if (entity) {
			this._scene.weldbody(body, entity, { allow_rotate: true });
		}

		const toy = new Toy(key, bodyKey, body, entity, this._scene);
		this._toys.push(toy);
		return toy;
	}

	/**
	 * @param {Toy} toy
	 */
	_despawn(toy) {
		if (!toy) {
			return;
		}
		this._scene.delbody(toy.bodyKey, toy.body);
	}
}

export default Toybox;
// 2026-06-14, Composer: scene owns body pool and physics weld [scnbd2]
// 2026-06-14, Composer: toybox spawn body mesh weld pipeline [tbx1]
// 2026-06-14, Composer: mesh-less spawn body only no weld [flty1]
