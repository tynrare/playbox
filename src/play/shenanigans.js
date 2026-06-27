/** @namespace ty */
// Purpose: weight-drop quake via Oimo aabbTest and contact list.

import { oimo } from "../lib/OimoPhysics.js";

const RigidBodyType = oimo.dynamics.rigidbody.RigidBodyType;

export const QUAKE_SPEED_MIN = 1.0;
const QUAKE_GAIN = 0.5;
const QUAKE_RADIUS_SCALE = 0.15;
const QUAKE_RADIUS_MIN = 6.0;
const QUAKE_RADIUS_MAX = 8.0;
const QUAKE_AABB_Y_BELOW = 0.5;
const QUAKE_AABB_Y_ABOVE = 2.0;
// 2026-06-27, Composer: quake uniform shake dv Oimo impulse scales by mass [plqke3]
// 2026-06-27, Composer: quake shake dv scales with impact speed [plqke4]
const QUAKE_SHAKE_V = 0.2;
// 2026-06-27, Composer: quake angular shake away from impact source [plqke7]
const QUAKE_SHAKE_R = 0.08;
// 2026-06-27, Composer: quake mass factor blends uniform and honest shake [plqke5]
// 0 = uniform Δv; 1 = full quaker/target ratio (damped by QUAKE_MASS_COMPARE_EXP)
const QUAKE_MASS_FACTOR = 0.5;
const QUAKE_MASS_COMPARE_EXP = 0.25;
const QUAKE_MASS_MULT_MIN = 0.5;
const QUAKE_MASS_MULT_MAX = 10;
// 2026-06-27, Composer: quake contact chain propagation decay per hop [plqke8]
const QUAKE_CHAIN_STEP = 0.9;
const QUAKE_CHAIN_MIN_MULT = 0.05;

const _aabb = new oimo.collision.geometry.Aabb();
const _aabbMin = new oimo.common.Vec3();
const _aabbMax = new oimo.common.Vec3();
const _impact = new oimo.common.Vec3();
const _impulse = new oimo.common.Vec3();
const _angImpulse = new oimo.common.Vec3();
const _normal = new oimo.common.Vec3();
const _pos = new oimo.common.Vec3();
/** @type {Set<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody>} */
const _queryBodies = new Set();
/** @type {Set<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody>} */
const _surfaceTouch = new Set();
/** @type {Map<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody, number>} */
const _seeds = new Map();
/** @type {Map<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody, number>} */
const _chainTargets = new Map();
/** @type {Set<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody>} */
const _chainNeighbors = new Set();
/** @type {{ body: import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody, mult: number }[]} */
const _chainQueue = [];

/**
 * @extends {oimo.dynamics.callback.AabbTestCallback}
 */
class QuakeAabbCallback extends oimo.dynamics.callback.AabbTestCallback {
	constructor() {
		super();
		/** @type {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody|null} */
		this._skipWeight = null;
		/** @type {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody|null} */
		this._skipSurface = null;
		/** @type {Set<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody>} */
		this._results = _queryBodies;
	}

	/**
	 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} skipWeight
	 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} skipSurface
	 * @returns {void}
	 */
	reset(skipWeight, skipSurface) {
		this._skipWeight = skipWeight;
		this._skipSurface = skipSurface;
		this._results.clear();
	}

	/**
	 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.Shape} shape
	 * @returns {void}
	 */
	process(shape) {
		const body = shape.getRigidBody();
		if (body === this._skipWeight || body === this._skipSurface) {
			return;
		}
		if (body.getType() !== RigidBodyType.DYNAMIC) {
			return;
		}
		this._results.add(body);
	}
}

const _aabbCb = new QuakeAabbCallback();

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

/**
 * @param {number} quakerMass
 * @param {number} targetMass
 * @returns {number}
 */
function quakeMassMult(quakerMass, targetMass) {
	const massCompare = quakerMass / targetMass;
	const honestMult = Math.pow(massCompare, QUAKE_MASS_COMPARE_EXP);
	return clamp(
		1 + QUAKE_MASS_FACTOR * (honestMult - 1),
		QUAKE_MASS_MULT_MIN,
		QUAKE_MASS_MULT_MAX,
	);
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.Contact} contact
 * @returns {number}
 */
export function contactApproachSpeed(contact) {
	const b1 = contact.getShape1().getRigidBody();
	const b2 = contact.getShape2().getRigidBody();
	const n = contact.getManifold().getNormal();
	const v1 = b1.getLinearVelocity();
	const v2 = b2.getLinearVelocity();
	const relN =
		(v1.x - v2.x) * n.x +
		(v1.y - v2.y) * n.y +
		(v1.z - v2.z) * n.z;
	return Math.max(0, -relN);
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.Contact} contact
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} weightBody
 * @returns {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody|null}
 */
function resolveSurfaceBody(contact, weightBody) {
	const b1 = contact.getShape1().getRigidBody();
	const b2 = contact.getShape2().getRigidBody();
	if (b1 === weightBody) {
		return b2;
	}
	if (b2 === weightBody) {
		return b1;
	}
	return null;
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.Contact} contact
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} weightBody
 * @param {oimo.common.Vec3} out
 * @returns {void}
 */
function collectImpactPoint(contact, weightBody, out) {
	const manifold = contact.getManifold();
	const count = manifold.getNumPoints();
	if (count > 0) {
		out.zero();
		const points = manifold.getPoints();
		for (let i = 0; i < count; i++) {
			const p = points[i].getPosition1();
			out.x += p.x;
			out.y += p.y;
			out.z += p.z;
		}
		out.x /= count;
		out.y /= count;
		out.z /= count;
		return;
	}
	weightBody.getPositionTo(out);
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.World} world
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} surfaceBody
 * @param {Set<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody>} out
 * @returns {void}
 */
function collectSurfaceTouch(world, surfaceBody, out) {
	out.clear();
	const cm = world.getContactManager();
	for (let c = cm.getContactList(); c != null; c = c.getNext()) {
		if (!c.isTouching()) {
			continue;
		}
		const b1 = c.getShape1().getRigidBody();
		const b2 = c.getShape2().getRigidBody();
		if (b1 === surfaceBody && b2 !== surfaceBody) {
			if (b2.getType() === RigidBodyType.DYNAMIC) {
				out.add(b2);
			}
		} else if (b2 === surfaceBody && b1 !== surfaceBody) {
			if (b1.getType() === RigidBodyType.DYNAMIC) {
				out.add(b1);
			}
		}
	}
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.World} world
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} body
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} skipWeight
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} skipSurface
 * @param {Set<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody>} out
 * @returns {void}
 */
function collectTouchingDynamics(world, body, skipWeight, skipSurface, out) {
	out.clear();
	const cm = world.getContactManager();
	for (let c = cm.getContactList(); c != null; c = c.getNext()) {
		if (!c.isTouching()) {
			continue;
		}
		const b1 = c.getShape1().getRigidBody();
		const b2 = c.getShape2().getRigidBody();
		let other;
		if (b1 === body) {
			other = b2;
		} else if (b2 === body) {
			other = b1;
		} else {
			continue;
		}
		if (other === skipWeight || other === skipSurface) {
			continue;
		}
		if (other.getType() !== RigidBodyType.DYNAMIC) {
			continue;
		}
		out.add(other);
	}
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.World} world
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} weightBody
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} surfaceBody
 * @param {Map<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody, number>} seeds
 * @returns {Map<import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody, number>}
 */
function buildChainTargets(world, weightBody, surfaceBody, seeds) {
	_chainTargets.clear();
	_chainQueue.length = 0;

	for (const [body, mult] of seeds) {
		_chainTargets.set(body, mult);
		_chainQueue.push({ body, mult });
	}

	let head = 0;
	while (head < _chainQueue.length) {
		const entry = _chainQueue[head++];
		const nextMult = entry.mult * QUAKE_CHAIN_STEP;
		if (nextMult < QUAKE_CHAIN_MIN_MULT) {
			continue;
		}

		collectTouchingDynamics(
			world,
			entry.body,
			weightBody,
			surfaceBody,
			_chainNeighbors,
		);

		for (const neighbor of _chainNeighbors) {
			const prev = _chainTargets.get(neighbor) ?? 0;
			if (nextMult <= prev) {
				continue;
			}
			_chainTargets.set(neighbor, nextMult);
			_chainQueue.push({ body: neighbor, mult: nextMult });
		}
	}

	return _chainTargets;
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} body
 * @param {number} quakerMass
 * @param {number} falloff
 * @param {number} speedScale
 * @param {number} chainMult
 * @param {boolean} surfaceStatic
 * @param {number} dx
 * @param {number} dz
 * @param {number} dist
 * @returns {void}
 */
function applyQuakeShake(
	body,
	quakerMass,
	falloff,
	speedScale,
	chainMult,
	surfaceStatic,
	dx,
	dz,
	dist,
) {
	const targetMass = body.getMass();
	if (targetMass <= 0) {
		return;
	}

	const shakeDv = QUAKE_SHAKE_V * falloff * speedScale * chainMult;
	const massMult = quakeMassMult(quakerMass, targetMass);
	const impulseMag = shakeDv * targetMass * massMult;
	if (surfaceStatic) {
		_impulse.init(0, impulseMag, 0);
	} else {
		_impulse.init(
			_normal.x * impulseMag,
			_normal.y * impulseMag,
			_normal.z * impulseMag,
		);
	}
	body.wakeUp();
	body.applyLinearImpulse(_impulse);

	if (dist > 1e-4 && QUAKE_SHAKE_R > 0) {
		const shakeRv = QUAKE_SHAKE_R * falloff * speedScale * chainMult;
		const angMag = shakeRv * targetMass * massMult * 0.1;
		const axisX = dz / dist;
		const axisZ = -dx / dist;
		_angImpulse.init(axisX * angMag, 0, axisZ * angMag);
		body.applyAngularImpulse(_angImpulse);
	}
}

/**
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.World} world
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.Contact} contact
 * @param {import("../lib/OimoPhysics.js").oimo.dynamics.rigidbody.RigidBody} weightBody
 * @returns {void}
 */
// 2026-06-27, Composer: quake via Oimo aabbTest and contact list [plqke1]
export function quake(world, contact, weightBody) {
	const speed = contactApproachSpeed(contact);
	if (speed < QUAKE_SPEED_MIN) {
		return;
	}

	const surfaceBody = resolveSurfaceBody(contact, weightBody);
	if (surfaceBody == null) {
		return;
	}

	const quakerMass = weightBody.getMass();
	if (quakerMass <= 0) {
		return;
	}

	const J = speed * quakerMass * QUAKE_GAIN;
	const radius = clamp(J * QUAKE_RADIUS_SCALE, QUAKE_RADIUS_MIN, QUAKE_RADIUS_MAX);

	collectImpactPoint(contact, weightBody, _impact);

	_aabbMin.init(
		_impact.x - radius,
		_impact.y - QUAKE_AABB_Y_BELOW,
		_impact.z - radius,
	);
	_aabbMax.init(
		_impact.x + radius,
		_impact.y + QUAKE_AABB_Y_ABOVE,
		_impact.z + radius,
	);
	_aabb.init(_aabbMin, _aabbMax);

	_aabbCb.reset(weightBody, surfaceBody);
	world.aabbTest(_aabb, _aabbCb);

	collectSurfaceTouch(world, surfaceBody, _surfaceTouch);

	contact.getManifold().getNormalTo(_normal);

	const surfaceStatic = surfaceBody.getType() === RigidBodyType.STATIC;
	const speedScale = speed / QUAKE_SPEED_MIN;

	// 2026-06-27, Composer: quake contact chain propagation decay per hop [plqke8]
	_seeds.clear();
	for (const body of _queryBodies) {
		if (!_surfaceTouch.has(body)) {
			continue;
		}
		body.getPositionTo(_pos);
		const dx = _pos.x - _impact.x;
		const dz = _pos.z - _impact.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist > radius) {
			continue;
		}
		const falloff = 1 - dist / radius;
		if (falloff <= 0 || body.getMass() <= 0) {
			continue;
		}
		_seeds.set(body, 1);
	}

	buildChainTargets(world, weightBody, surfaceBody, _seeds);

	for (const [body, chainMult] of _chainTargets) {
		body.getPositionTo(_pos);
		const dx = _pos.x - _impact.x;
		const dz = _pos.z - _impact.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist > radius) {
			continue;
		}
		const falloff = 1 - dist / radius;
		if (falloff <= 0) {
			continue;
		}
		applyQuakeShake(
			body,
			quakerMass,
			falloff,
			speedScale,
			chainMult,
			surfaceStatic,
			dx,
			dz,
			dist,
		);
	}
}

// 2026-06-27, Composer: quake via Oimo aabbTest and contact list [plqke1]
// 2026-06-27, Composer: quake uniform shake dv Oimo impulse scales by mass [plqke3]
// 2026-06-27, Composer: quake shake dv scales with impact speed [plqke4]
// 2026-06-27, Composer: quake mass factor blends uniform and honest shake [plqke5]
// 2026-06-27, Composer: quake mass mult from damped quaker/target ratio [plqke6]
// 2026-06-27, Composer: quake angular shake away from impact source [plqke7]
// 2026-06-27, Composer: quake contact chain propagation decay per hop [plqke8]
