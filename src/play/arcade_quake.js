/** @namespace ty */
// Purpose: weight-drop quake via Rapier AABB query and contact pairs.
import { RAPIER } from "../core/physics.js";

export const QUAKE_SPEED_MIN = 1.0;
const QUAKE_GAIN = 0.5;
const QUAKE_RADIUS_SCALE = 0.15;
const QUAKE_RADIUS_MIN = 6.0;
const QUAKE_RADIUS_MAX = 8.0;
const QUAKE_AABB_Y_BELOW = 0.5;
const QUAKE_AABB_Y_ABOVE = 2.0;
const QUAKE_SHAKE_V = 0.2;
const QUAKE_SHAKE_R = 0.08;
const QUAKE_MASS_FACTOR = 0.5;
const QUAKE_MASS_COMPARE_EXP = 0.25;
const QUAKE_MASS_MULT_MIN = 0.5;
const QUAKE_MASS_MULT_MAX = 10;
const QUAKE_CHAIN_STEP = 0.9;
const QUAKE_CHAIN_MIN_MULT = 0.05;

const _aabbCenter = { x: 0, y: 0, z: 0 };
const _aabbHalf = { x: 0, y: 0, z: 0 };
const _impact = { x: 0, y: 0, z: 0 };
const _impulse = { x: 0, y: 0, z: 0 };
const _angImpulse = { x: 0, y: 0, z: 0 };
const _normal = { x: 0, y: 0, z: 0 };
const _pos = { x: 0, y: 0, z: 0 };
/** @type {Set<import("../lib/Rapier3d.js").RigidBody>} */
const _queryBodies = new Set();
/** @type {Set<import("../lib/Rapier3d.js").RigidBody>} */
const _surfaceTouch = new Set();
/** @type {Map<import("../lib/Rapier3d.js").RigidBody, number>} */
const _seeds = new Map();
/** @type {Map<import("../lib/Rapier3d.js").RigidBody, number>} */
const _chainTargets = new Map();
/** @type {Set<import("../lib/Rapier3d.js").RigidBody>} */
const _chainNeighbors = new Set();
/** @type {{ body: import("../lib/Rapier3d.js").RigidBody, mult: number }[]} */
const _chainQueue = [];

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
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @returns {number}
 */
export function contactApproachSpeed(world, collider1, collider2) {
	let approach = 0;
	const c1 = world.getCollider(collider1);
	const c2 = world.getCollider(collider2);
	if (!c1 || !c2) {
		return 0;
	}
	const b1 = c1.parent();
	const b2 = c2.parent();
	if (!b1 || !b2) {
		return 0;
	}
	world.contactPair(c1, c2, (manifold) => {
		const n = manifold.normal();
		const v1 = b1.linvel();
		const v2 = b2.linvel();
		const relN =
			(v1.x - v2.x) * n.x +
			(v1.y - v2.y) * n.y +
			(v1.z - v2.z) * n.z;
		approach = Math.max(approach, Math.max(0, -relN));
	});
	return approach;
}

/**
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @param {import("../lib/Rapier3d.js").RigidBody} weightBody
 * @returns {import("../lib/Rapier3d.js").RigidBody|null}
 */
function resolveSurfaceBody(world, collider1, collider2, weightBody) {
	const c1 = world.getCollider(collider1);
	const c2 = world.getCollider(collider2);
	const b1 = c1?.parent() ?? null;
	const b2 = c2?.parent() ?? null;
	if (b1 === weightBody) {
		return b2;
	}
	if (b2 === weightBody) {
		return b1;
	}
	return null;
}

/**
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @param {import("../lib/Rapier3d.js").RigidBody} weightBody
 * @param {{ x: number, y: number, z: number }} out
 * @returns {void}
 */
function collectImpactPoint(world, collider1, collider2, weightBody, out) {
	const c1 = world.getCollider(collider1);
	const c2 = world.getCollider(collider2);
	if (!c1 || !c2) {
		const p = weightBody.translation();
		out.x = p.x;
		out.y = p.y;
		out.z = p.z;
		return;
	}
	let count = 0;
	world.contactPair(c1, c2, (manifold, flipped) => {
		const n = manifold.numSolverContacts();
		for (let i = 0; i < n; i++) {
			const pt = manifold.solverContactPoint(i);
			if (flipped) {
				out.x += pt.x;
				out.y += pt.y;
				out.z += pt.z;
			} else {
				out.x += pt.x;
				out.y += pt.y;
				out.z += pt.z;
			}
			count++;
		}
	});
	if (count > 0) {
		out.x /= count;
		out.y /= count;
		out.z /= count;
		return;
	}
	const p = weightBody.translation();
	out.x = p.x;
	out.y = p.y;
	out.z = p.z;
}

/**
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {import("../lib/Rapier3d.js").Collider} surfaceCollider
 * @param {Set<import("../lib/Rapier3d.js").RigidBody>} out
 * @returns {void}
 */
function collectSurfaceTouch(world, surfaceCollider, out) {
	out.clear();
	world.contactPairsWith(surfaceCollider, (other) => {
		const body = other.parent();
		if (body && body.isDynamic()) {
			out.add(body);
		}
	});
}

/**
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {import("../lib/Rapier3d.js").RigidBody} body
 * @param {import("../lib/Rapier3d.js").RigidBody} skipWeight
 * @param {import("../lib/Rapier3d.js").RigidBody} skipSurface
 * @param {Set<import("../lib/Rapier3d.js").RigidBody>} out
 * @returns {void}
 */
function collectTouchingDynamics(world, body, skipWeight, skipSurface, out) {
	out.clear();
	if (body.numColliders() <= 0) {
		return;
	}
	const col = body.collider(0);
	world.contactPairsWith(col, (other) => {
		const otherBody = other.parent();
		if (!otherBody || otherBody === skipWeight || otherBody === skipSurface) {
			return;
		}
		if (otherBody.isDynamic()) {
			out.add(otherBody);
		}
	});
}

/**
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {import("../lib/Rapier3d.js").RigidBody} weightBody
 * @param {import("../lib/Rapier3d.js").RigidBody} surfaceBody
 * @param {Map<import("../lib/Rapier3d.js").RigidBody, number>} seeds
 * @returns {Map<import("../lib/Rapier3d.js").RigidBody, number>}
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
 * @param {import("../lib/Rapier3d.js").RigidBody} body
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
	const targetMass = body.mass();
	if (targetMass <= 0) {
		return;
	}

	const shakeDv = QUAKE_SHAKE_V * falloff * speedScale * chainMult;
	const massMult = quakeMassMult(quakerMass, targetMass);
	const impulseMag = shakeDv * targetMass * massMult;
	if (surfaceStatic) {
		_impulse.x = 0;
		_impulse.y = impulseMag;
		_impulse.z = 0;
	} else {
		_impulse.x = _normal.x * impulseMag;
		_impulse.y = _normal.y * impulseMag;
		_impulse.z = _normal.z * impulseMag;
	}
	body.wakeUp();
	body.applyImpulse(_impulse, true);

	if (dist > 1e-4 && QUAKE_SHAKE_R > 0) {
		const shakeRv = QUAKE_SHAKE_R * falloff * speedScale * chainMult;
		const angMag = shakeRv * targetMass * massMult * 0.1;
		const axisX = dz / dist;
		const axisZ = -dx / dist;
		_angImpulse.x = axisX * angMag;
		_angImpulse.y = 0;
		_angImpulse.z = axisZ * angMag;
		body.applyTorqueImpulse(_angImpulse, true);
	}
}

/**
 * @param {import("../lib/Rapier3d.js").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @param {import("../lib/Rapier3d.js").RigidBody} weightBody
 * @returns {void}
 */
// 2026-06-29, Composer: quake via Rapier AABB and contactPairsWith [plqke1]
export function quake(world, collider1, collider2, weightBody) {
	const speed = contactApproachSpeed(world, collider1, collider2);
	if (speed < QUAKE_SPEED_MIN) {
		return;
	}

	const surfaceBody = resolveSurfaceBody(world, collider1, collider2, weightBody);
	if (surfaceBody == null) {
		return;
	}

	const quakerMass = weightBody.mass();
	if (quakerMass <= 0) {
		return;
	}

	const J = speed * quakerMass * QUAKE_GAIN;
	const radius = clamp(J * QUAKE_RADIUS_SCALE, QUAKE_RADIUS_MIN, QUAKE_RADIUS_MAX);

	collectImpactPoint(world, collider1, collider2, weightBody, _impact);

	_aabbCenter.x = _impact.x;
	_aabbCenter.y = _impact.y + (QUAKE_AABB_Y_ABOVE - QUAKE_AABB_Y_BELOW) * 0.5;
	_aabbCenter.z = _impact.z;
	_aabbHalf.x = radius;
	_aabbHalf.y = (QUAKE_AABB_Y_ABOVE + QUAKE_AABB_Y_BELOW) * 0.5;
	_aabbHalf.z = radius;

	_queryBodies.clear();
	world.collidersWithAabbIntersectingAabb(_aabbCenter, _aabbHalf, (collider) => {
		const body = collider.parent();
		if (!body || body === weightBody || body === surfaceBody) {
			return true;
		}
		if (!body.isDynamic()) {
			return true;
		}
		_queryBodies.add(body);
		return true;
	});

	const surfaceCollider =
		surfaceBody.numColliders() > 0 ? surfaceBody.collider(0) : null;
	if (surfaceCollider) {
		collectSurfaceTouch(world, surfaceCollider, _surfaceTouch);
	} else {
		_surfaceTouch.clear();
	}

	const c1 = world.getCollider(collider1);
	const c2 = world.getCollider(collider2);
	_normal.x = 0;
	_normal.y = 1;
	_normal.z = 0;
	if (c1 && c2) {
		world.contactPair(c1, c2, (manifold) => {
			const n = manifold.normal();
			_normal.x = n.x;
			_normal.y = n.y;
			_normal.z = n.z;
		});
	}

	const surfaceStatic = surfaceBody.isFixed();
	const speedScale = speed / QUAKE_SPEED_MIN;

	_seeds.clear();
	for (const body of _queryBodies) {
		if (!_surfaceTouch.has(body)) {
			continue;
		}
		const p = body.translation();
		const dx = p.x - _impact.x;
		const dz = p.z - _impact.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist > radius) {
			continue;
		}
		const falloff = 1 - dist / radius;
		if (falloff <= 0 || body.mass() <= 0) {
			continue;
		}
		_seeds.set(body, 1);
	}

	buildChainTargets(world, weightBody, surfaceBody, _seeds);

	for (const [body, chainMult] of _chainTargets) {
		const p = body.translation();
		const dx = p.x - _impact.x;
		const dz = p.z - _impact.z;
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

// 2026-06-29, Composer: quake via Rapier AABB and contactPairsWith [plqke1]
