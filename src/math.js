// 2026-06-14, Composer: shared THREE math cache and transforms [thmth1]
import * as THREE from "three";

const qidentity = new THREE.Quaternion();

export const v3up = new THREE.Vector3(0, 1, 0);
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

export const cache = {
  color0: new THREE.Color(),
  vec3: vec3slots,
};

export const cachev3 = vec3slots;

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

// 2026-06-14, Composer: replace glmatrix with THREE math types [thmth1]
