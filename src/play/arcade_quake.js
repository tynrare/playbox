/** @namespace ty */
// Purpose: weight-drop quake via Rapier AABB query and contact pairs.
import { RAPIER, max_manifold_impulse } from "../core/physics.js";

export const QUAKE_IMPULSE_MIN = 1.0;
const QUAKE_GAIN = 0.2;
const QUAKE_RADIUS_SCALE = 0.03;
const QUAKE_RADIUS_MIN = 2.0;
const QUAKE_RADIUS_MAX = 8.0;
const QUAKE_AABB_Y_BELOW = 0.5;
const QUAKE_AABB_Y_ABOVE = 2.0;
const QUAKE_SPIN_GAIN = 0.08;
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
const _rotPt = { x: 0, y: 0, z: 0 };
const _colliderQuat = { x: 0, y: 0, z: 0, w: 1 };
const _localContact = { x: 0, y: 0, z: 0 };
// 2026-06-30, Composer: contactCollider target-out scratch [plqke10]
const _shapeContact = {
	distance: 0,
	point1: { x: 0, y: 0, z: 0 },
	point2: { x: 0, y: 0, z: 0 },
	normal1: { x: 0, y: 0, z: 0 },
	normal2: { x: 0, y: 0, z: 0 },
};
const CONTACT_PREDICTION = 0.1;
/** @type {Set<import("@dimforge/rapier3d").RigidBody>} */
const _queryBodies = new Set();
/** @type {Set<import("@dimforge/rapier3d").RigidBody>} */
const _surfaceTouch = new Set();
/** @type {Map<import("@dimforge/rapier3d").RigidBody, number>} */
const _seeds = new Map();
/** @type {Map<import("@dimforge/rapier3d").RigidBody, number>} */
const _chainTargets = new Map();
/** @type {Set<import("@dimforge/rapier3d").RigidBody>} */
const _chainNeighbors = new Set();
/** @type {{ body: import("@dimforge/rapier3d").RigidBody, mult: number }[]} */
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
 * @param {import("@dimforge/rapier3d").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @returns {number}
 */
// 2026-06-30, Composer: max solver normal impulse from contact pair [plqke7]
export function contactImpactImpulse(world, collider1, collider2) {
	const c1 = world.getCollider(collider1);
	const c2 = world.getCollider(collider2);
	if (!c1 || !c2) {
		return 0;
	}
	let maxImpulse = 0;
	world.contactPair(c1, c2, (manifold) => {
		const impulse = max_manifold_impulse(manifold);
		if (impulse > maxImpulse) {
			maxImpulse = impulse;
		}
	});
	return maxImpulse;
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @param {import("@dimforge/rapier3d").RigidBody} weightBody
 * @returns {import("@dimforge/rapier3d").RigidBody|null}
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
 * @param {{ x: number, y: number, z: number, w: number }} q
 * @param {{ x: number, y: number, z: number }} v
 * @param {{ x: number, y: number, z: number }} out
 * @returns {void}
 */
function quatRotateVec(q, v, out) {
	const ix = q.w * v.x + q.y * v.z - q.z * v.y;
	const iy = q.w * v.y + q.z * v.x - q.x * v.z;
	const iz = q.w * v.z + q.x * v.y - q.y * v.x;
	const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
	out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
	out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
	out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
}

/**
 * @param {import("@dimforge/rapier3d").Collider} collider
 * @param {{ x: number, y: number, z: number }} local
 * @param {{ x: number, y: number, z: number }} out
 * @returns {void}
 */
function localPointToWorld(collider, local, out) {
	collider.translation(_pos);
	collider.rotation(_colliderQuat);
	quatRotateVec(_colliderQuat, local, out);
	out.x += _pos.x;
	out.y += _pos.y;
	out.z += _pos.z;
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {import("@dimforge/rapier3d").Collider} c1
 * @param {import("@dimforge/rapier3d").Collider} c2
 * @param {{ x: number, y: number, z: number }} out
 * @returns {number}
 */
function accumulateContactPairPoints(world, c1, c2, out) {
	let count = 0;
	world.contactPair(c1, c2, (manifold, flipped) => {
		const nSolver = manifold.numSolverContacts();
		for (let i = 0; i < nSolver; i++) {
			if (manifold.solverContactPoint(i, _rotPt) == null) {
				continue;
			}
			out.x += _rotPt.x;
			out.y += _rotPt.y;
			out.z += _rotPt.z;
			count++;
		}
		if (nSolver > 0) {
			return;
		}
		const col = flipped ? c2 : c1;
		const nGeom = manifold.numContacts();
		for (let i = 0; i < nGeom; i++) {
			const ok = flipped
				? manifold.localContactPoint2(i, _localContact) != null
				: manifold.localContactPoint1(i, _localContact) != null;
			if (!ok) {
				continue;
			}
			localPointToWorld(col, _localContact, _rotPt);
			out.x += _rotPt.x;
			out.y += _rotPt.y;
			out.z += _rotPt.z;
			count++;
		}
	});
	return count;
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {import("@dimforge/rapier3d").RigidBody} weightBody
 * @param {import("@dimforge/rapier3d").RigidBody} surfaceBody
 * @param {{ x: number, y: number, z: number }} out
 * @returns {void}
 */
// 2026-06-29, Composer: impact from weight-surface world contacts only [plqke3]
function collectImpactPoint(world, weightBody, surfaceBody, out) {
	out.x = 0;
	out.y = 0;
	out.z = 0;
	let count = 0;

	const nWeight = weightBody.numColliders();
	const nSurface = surfaceBody.numColliders();
	for (let wi = 0; wi < nWeight; wi++) {
		const wc = weightBody.collider(wi);
		for (let si = 0; si < nSurface; si++) {
			const sc = surfaceBody.collider(si);
			const hit = wc.contactCollider(sc, CONTACT_PREDICTION, _shapeContact);
			if (hit) {
				out.x += (hit.point1.x + hit.point2.x) * 0.5;
				out.y += (hit.point1.y + hit.point2.y) * 0.5;
				out.z += (hit.point1.z + hit.point2.z) * 0.5;
				count++;
				continue;
			}
			count += accumulateContactPairPoints(world, wc, sc, out);
		}
	}

	if (count > 0) {
		out.x /= count;
		out.y /= count;
		out.z /= count;
		return;
	}

	weightBody.translation(_pos);
	out.x = _pos.x;
	out.z = _pos.z;
	surfaceBody.translation(_rotPt);
	out.y = surfaceBody.isFixed() ? _rotPt.y : _pos.y;
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {import("@dimforge/rapier3d").Collider} surfaceCollider
 * @param {Set<import("@dimforge/rapier3d").RigidBody>} out
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
 * @param {import("@dimforge/rapier3d").World} world
 * @param {import("@dimforge/rapier3d").RigidBody} body
 * @param {import("@dimforge/rapier3d").RigidBody} skipWeight
 * @param {import("@dimforge/rapier3d").RigidBody} skipSurface
 * @param {Set<import("@dimforge/rapier3d").RigidBody>} out
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
 * @param {import("@dimforge/rapier3d").World} world
 * @param {import("@dimforge/rapier3d").RigidBody} weightBody
 * @param {import("@dimforge/rapier3d").RigidBody} surfaceBody
 * @param {Map<import("@dimforge/rapier3d").RigidBody, number>} seeds
 * @returns {Map<import("@dimforge/rapier3d").RigidBody, number>}
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
 * @param {import("@dimforge/rapier3d").RigidBody} body
 * @param {number} impulseMag
 * @param {boolean} surfaceStatic
 * @param {number} dx
 * @param {number} dz
 * @param {number} dist
 * @returns {void}
 */
// 2026-06-30, Composer: quake shake applies solver impulse Ns [plqke8]
function applyQuakeShake(body, impulseMag, surfaceStatic, dx, dz, dist) {
	if (impulseMag <= 0) {
		return;
	}

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

	if (dist > 1e-4 && QUAKE_SPIN_GAIN > 0) {
		const angMag = impulseMag * QUAKE_SPIN_GAIN;
		const axisX = dz / dist;
		const axisZ = -dx / dist;
		_angImpulse.x = axisX * angMag;
		_angImpulse.y = 0;
		_angImpulse.z = axisZ * angMag;
		body.applyTorqueImpulse(_angImpulse, true);
	}
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {number} collider1
 * @param {number} collider2
 * @param {import("@dimforge/rapier3d").RigidBody} weightBody
 * @param {number} [impactImpulse]
 * @returns {void}
 */
// 2026-06-29, Composer: quake via Rapier AABB and contactPairsWith [plqke1]
export function quake(world, collider1, collider2, weightBody, impactImpulse) {
	const impulse =
		impactImpulse ??
		contactImpactImpulse(world, collider1, collider2);
	if (impulse < QUAKE_IMPULSE_MIN) {
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

	// 2026-06-30, Composer: quake radius and shake from solver impulse Ns [plqke8]
	const impactDv = impulse / quakerMass;
	const radius = clamp(
		impulse * QUAKE_RADIUS_SCALE,
		QUAKE_RADIUS_MIN,
		QUAKE_RADIUS_MAX,
	);

	collectImpactPoint(world, weightBody, surfaceBody, _impact);

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
			manifold.normal(_normal);
		});
	}

	const surfaceStatic = surfaceBody.isFixed();

	_seeds.clear();
	for (const body of _queryBodies) {
		if (!_surfaceTouch.has(body)) {
			continue;
		}
		body.translation(_pos);
		const dx = _pos.x - _impact.x;
		const dz = _pos.z - _impact.z;
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
		body.translation(_pos);
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
		const targetMass = body.mass();
		if (targetMass <= 0) {
			continue;
		}
		const massMult = quakeMassMult(quakerMass, targetMass);
		const shakeDv = impactDv * QUAKE_GAIN * falloff * chainMult * massMult;
		// 2026-06-30, Composer: target mass scales impulse for uniform jump [plqke9]
		const shakeImpulse = shakeDv * targetMass;
		applyQuakeShake(body, shakeImpulse, surfaceStatic, dx, dz, dist);
	}
}

// 2026-06-29, Composer: quake via Rapier AABB and contactPairsWith [plqke1]
// 2026-06-29, Composer: impact from weight-surface world contacts only [plqke3]
// 2026-06-30, Composer: #337 target-out Rapier reads [rphlib1]
// 2026-06-30, Composer: max solver normal impulse from contact pair [plqke7]
// 2026-06-30, Composer: quake shake applies solver impulse Ns [plqke8]
// 2026-06-30, Composer: target mass scales impulse for uniform jump [plqke9]
// 2026-06-30, Composer: contactCollider target-out scratch [plqke10]
