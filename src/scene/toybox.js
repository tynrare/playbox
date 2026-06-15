/** @namespace ty */
// 2026-06-14, Composer: toybox spawn body mesh weld pipeline [tbx1]
import logger from "../logger.js";
import { oimo } from "../lib/OimoPhysics.js";
import { RigidBody, RigidBodyType } from "../core/physics.js";

/**
 * @class Toy
 * @memberof pb.scene
 */
export class Toy {
	/**
	 * @param {string} key
	 * @param {oimo.dynamics.rigidbody.RigidBody} body
	 * @param {import("@three.ez/instanced-mesh").InstancedEntity|null} entity
	 * @param {import("../core/physics.js").default} physics
	 */
	constructor(key, body, entity, physics) {
		this.key = key;
		this.body = body;
		this.entity = entity;
		this._physics = physics;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	setPosition(x, y, z) {
		this._physics.setBodyPosition(this.body, x, y, z);
	}
}

/**
 * @class Toybox
 * @memberof pb.scene
 */
class Toybox {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		this._core = core;
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
		const conf = this._core.db.get("toys")?.getconfig(key);
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
			const model = this._core.scene.model(meshKey);
			if (!model?.entity) {
				logger.error(
					`Toybox::spawn "${key}" error: mesh "${meshKey}" failed`,
				);
				return null;
			}
			entity = model.entity;
		}

		const body = this._makeBody(bodyKey);
		if (!body) {
			return null;
		}

		this._core.physics.addBody(body);
		if (entity) {
			this._core.physics.weld(body, entity, { allow_rotate: true });
		}

		const toy = new Toy(key, body, entity, this._core.physics);
		this._toys.push(toy);
		return toy;
	}

	/**
	 * @param {string} name
	 * @returns {oimo.dynamics.rigidbody.RigidBody|null}
	 */
	_makeBody(name) {
		const bodyconf = this._core.db.get("bodies")?.getconfig(name);
		if (!bodyconf) {
			logger.error(`Toybox::_makeBody error: no body "${name}" declared`);
			return null;
		}

		const physics = this._core.physics;
		const rbody_config = new oimo.dynamics.rigidbody.RigidBodyConfig();
		rbody_config.position.init(0, 1, 0);
		rbody_config.type = bodyconf.dynamics
			? RigidBodyType.DYNAMIC
			: RigidBodyType.STATIC;
		rbody_config.angularDamping = bodyconf.adamping ?? 1;
		rbody_config.linearDamping = bodyconf.ldamping ?? 1;

		const body = new RigidBody(rbody_config);
		let geometry = null;

		switch (bodyconf.shape) {
			case "box":
				geometry = new oimo.collision.geometry.BoxGeometry(
					physics.cache.vec3_0.init(
						(bodyconf.w ?? 1) * 0.5,
						(bodyconf.h ?? 1) * 0.5,
						(bodyconf.l ?? 1) * 0.5,
					),
				);
				break;
			default:
				logger.error(
					`Toybox::_makeBody error: unsupported shape "${bodyconf.shape}"`,
				);
				return null;
		}

		if (geometry) {
			const rshape_config = new oimo.dynamics.rigidbody.ShapeConfig();
			rshape_config.geometry = geometry;
			rshape_config.density = bodyconf.density ?? 1;
			rshape_config.friction = bodyconf.friction ?? 1;
			rshape_config.restitution = bodyconf.restitution ?? 0;
			const rshape = new oimo.dynamics.rigidbody.Shape(rshape_config);
			body.addShape(rshape);
		}

		body.setGravityScale(bodyconf.gravityscale ?? 1);
		return body;
	}

	/**
	 * @param {Toy} toy
	 */
	_despawn(toy) {
		if (!toy) {
			return;
		}
		this._core.physics.remove(toy.body);
	}
}

export default Toybox;
// 2026-06-14, Composer: toybox spawn body mesh weld pipeline [tbx1]
// 2026-06-14, Composer: mesh-less spawn body only no weld [flty1]
