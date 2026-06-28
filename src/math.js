// 2026-06-14, Composer: shared THREE math cache and transforms [thmth1]
import * as THREE from "three";

export const qidentity = new THREE.Quaternion();

export const v3up = new THREE.Vector3(0, 1, 0);
export const v3right = new THREE.Vector3(1, 0, 0);
export const v3forward = new THREE.Vector3(0, 0, 1);
export const vzero = new THREE.Vector3(0, 0, 0);
export const vone = new THREE.Vector3(1, 1, 1);

const vec3slots = {
  v0: new THREE.Vector3(),
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  v3: new THREE.Vector3(),
  v4: new THREE.Vector3(),
  v5: new THREE.Vector3(),
  v6: new THREE.Vector3(),
  v7: new THREE.Vector3(),
  v8: new THREE.Vector3(),
  v9: new THREE.Vector3(),
};

const quaternionSlots = {
  q0: new THREE.Quaternion(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
};

export const cache = {
  color0: new THREE.Color(),
  // 2026-06-26, Composer: second color scratch for _get_material [thmth3]
  color1: new THREE.Color(),
  vec3: vec3slots,
  quat: quaternionSlots,
  // 2026-06-26, Composer: box3 mat4 scratch for bounds bodies [thmth2]
  box3: new THREE.Box3(),
  mat4: new THREE.Matrix4(),
};

export const cachev3 = vec3slots;
export const cacheq = quaternionSlots;

/**
 * @param {THREE.Matrix4} matrix
 * @param {THREE.Vector3|null} translate
 * @param {THREE.Quaternion|null} rotate
 * @param {THREE.Vector3|null} scale
 * @returns {THREE.Matrix4}
 */
export function transform(matrix, translate, rotate, scale) {
  // 2026-06-14, Composer: replace glmatrix with THREE math types [thmth1]
  matrix.compose(
    translate ?? vzero,
    rotate ?? qidentity,
    scale ?? vone,
  );
  return matrix;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {THREE.Vector3} [out]
 * @returns {THREE.Vector3}
 */
export function v3(x, y, z, out = cachev3.v0) {
  return out.set(x, y, z);
}

/**
 * @param {number} min
 * @param {number} max
 * @param {number} v
 * @returns {number}
 */
export function clamp(min, max, v) {
  // 2026-06-14, Composer: clamp helper for mempool writes [memp1]
  return Math.max(min, Math.min(max, v));
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  // 2026-06-18, Composer: lerp for loop smoothed dt [lrpdt1]
  return a + t * (b - a);
}

// 2026-06-14, Composer: replace glmatrix with THREE math types [thmth1]
// 2026-06-18, Composer: lerp for loop smoothed dt [lrpdt1]
// 2026-06-26, Composer: box3 mat4 scratch for bounds bodies [thmth2]
// 2026-06-26, Composer: second color scratch for _get_material [thmth3]
