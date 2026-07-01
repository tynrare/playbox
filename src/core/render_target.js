/** @namespace ty */
// Purpose: render backend for sub-cores that draw into a texture target.

import * as THREE from "three";

/**
 * @class RenderTargetRender
 * @memberof pb.core
 */
class RenderTargetRender {
	/**
	 * @param {THREE.WebGLRenderer} renderer
	 * @param {number} width
	 * @param {number} height
	 */
	constructor(renderer, width = 512, height = 256) {
		this.renderer = renderer;
		this.width = width;
		this.height = height;
		/** @type {THREE.Scene|null} */
		this.scene = null;
		/** @type {THREE.PerspectiveCamera|null} */
		this.camera = null;
		/** @type {HTMLCanvasElement|null} */
		this.canvas = renderer.domElement ?? null;
		/** @type {THREE.WebGLRenderTarget|null} */
		this.target = null;
	}

	/** @returns {this} */
	init() {
		return this;
	}

	/** @returns {void} */
	start() {
		if (this.target) {
			return;
		}
		// 2026-07-01, GPT-5.5: sub-core render owns texture target [rtcore1]
		this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
			depthBuffer: true,
			stencilBuffer: false,
		});
		this.target.texture.colorSpace = THREE.SRGBColorSpace;
		this.scene = new THREE.Scene();
		// 2026-07-01, GPT-5.5: screen target clear shows render activity [rtcore2]
		this.scene.background = new THREE.Color(0x203050);
		this.camera = new THREE.PerspectiveCamera(
			42,
			this.width / this.height,
			0.1,
			1000,
		);
		this.camera.position.set(1, 1, 1);
		this.camera.lookAt(0, 0, 0);
	}

	/**
	 * @param {number} width
	 * @param {number} height
	 * @returns {void}
	 */
	setSize(width, height) {
		this.width = width;
		this.height = height;
		this.target?.setSize(width, height);
		if (this.camera) {
			this.camera.aspect = width / height;
			this.camera.updateProjectionMatrix();
		}
	}

	/**
	 * @param {boolean} [enabled]
	 * @returns {void}
	 */
	refresh_shadows_runtime(enabled = this.renderer?.shadowMap?.enabled) {
		// 2026-07-01, GPT-5.5: render target matches shadow API [rtshd1]
		if (!this.renderer?.shadowMap) {
			return;
		}
		this.renderer.shadowMap.enabled = !!enabled;
		this.renderer.shadowMap.needsUpdate = !!enabled;
	}

	/** @returns {void} */
	stop() {
		this.target?.dispose();
		this.target = null;
		this.scene = null;
		this.camera = null;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}
}

export default RenderTargetRender;
// 2026-07-01, GPT-5.5: sub-core render owns texture target [rtcore1]
// 2026-07-01, GPT-5.5: screen target clear shows render activity [rtcore2]
// 2026-07-01, GPT-5.5: render target matches shadow API [rtshd1]
