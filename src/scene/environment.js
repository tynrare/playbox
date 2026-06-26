/** @namespace ty */
// 2026-06-14, Composer: floor shadow plane lights csm port [env1]
import * as THREE from "three";
import { CSM } from "three/addons/csm/CSM.js";
import { DitheredOpacity } from "../render/materials/DitheredOpacity.js";
import { ExtendedMaterial } from "../render/materials/ExtendedMaterial.js";
import { vzero } from "../math.js";

const DEFAULT_CONFIG = {
	bgcolor: 0x66c0dc,
	AmbientLight: 0x888888,
	DirectionalLight: 0xffffff,
	DirectionalLight1: 0x222200,
	HemisphereLight_a: 0x0000ff,
	HemisphereLight_b: 0x00ffff,
	cascaded_shadow_maps: true,
	lights: true,
	shadows: true,
};

/**
 * @param {THREE.Texture|null} map
 * @param {number} size
 * @returns {THREE.Mesh}
 */
function createFloorPlane(map = null, size = 64) {
	const repeats = 8;
	const geometry = new THREE.PlaneGeometry(size, size);
	geometry.rotateX(-Math.PI * 0.5);
	const material = new THREE.MeshStandardMaterial({
		map: map ?? null,
		color: 0xffffff,
	});
	const uv = geometry.attributes.uv;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(i, uv.getX(i) * repeats, uv.getY(i) * repeats);
	}
	uv.needsUpdate = true;
	if (map) {
		map.wrapS = THREE.RepeatWrapping;
		map.wrapT = THREE.RepeatWrapping;
	}
	const plane = new THREE.Mesh(geometry, material);
	plane.receiveShadow = false;
	return plane;
}

/**
 * @returns {THREE.Mesh}
 */
function createShadowPlane(size = 32) {
	const geometry = new THREE.PlaneGeometry(size, size);
	geometry.rotateX(-Math.PI * 0.5);
	const material = new ExtendedMaterial(
		THREE.ShadowMaterial,
		[DitheredOpacity],
		{
			opacity: 0.9,
			color: 0x444444,
		},
	);
	const plane = new THREE.Mesh(geometry, material);
	plane.receiveShadow = true;
	return plane;
}

/**
 * @class Environment
 * @memberof pb.scene
 */
class Environment {
	/**
	 * @param {import("../core/render.js").default} render
	 * @param {import("../core/assets.js").default} assets
	 * @param {typeof DEFAULT_CONFIG} [config]
	 */
	constructor(render, assets, config = DEFAULT_CONFIG) {
		this._render = render;
		this._assets = assets;
		/** @type {THREE.Mesh|null} */
		this.plane = null;
		/** @type {THREE.Mesh|null} */
		this.shadowplane = null;
		/** @type {CSM|null} */
		this.csm = null;
		/** @type {typeof DEFAULT_CONFIG} */
		this.config = config;
		this.lights = {
			/** @type {THREE.DirectionalLight|null} */
			directional: null,
			/** @type {THREE.DirectionalLight|null} */
			directional1: null,
			/** @type {THREE.AmbientLight|null} */
			ambient: null,
			/** @type {THREE.HemisphereLight|null} */
			hemisphere: null,
		};
	}

	/**
	 * @returns {Environment}
	 */
	start() {
		// 2026-06-14, Composer: run renamed start, config-only opts [env4]
		const renderer = this._render.renderer;
		const scene = this._render.scene;
		const camera = this._render.camera;
		if (!renderer || !scene || !camera) {
			return this;
		}

		this._setupRenderer(renderer);
		this._setupLights(scene, camera);

		this.plane = createFloorPlane();
		this.plane.visible = false;
		scene.add(this.plane);
		if (this.csm && this.plane.material) {
			this.csm.setupMaterial(this.plane.material);
			this.plane.receiveShadow = false;
		}

		this.shadowplane = createShadowPlane();
		this.shadowplane.position.y = 0.01;
		scene.add(this.shadowplane);

		if (scene.background instanceof THREE.Color) {
			scene.background.setHex(this.config.bgcolor);
		} else {
			scene.background = new THREE.Color(this.config.bgcolor);
		}

		return this;
	}

	/**
	 * @param {THREE.WebGLRenderer} renderer
	 * @returns {void}
	 */
	_setupRenderer(renderer) {
		renderer.shadowMap.enabled = this.config.shadows;
		renderer.shadowMap.type = THREE.PCFShadowMap;
	}

	/**
	 * @param {THREE.Scene} scene
	 * @param {THREE.PerspectiveCamera} camera
	 * @returns {void}
	 */
	_setupLights(scene, camera) {
		const ambient = new THREE.AmbientLight(this.config.AmbientLight, 1);
		scene.add(ambient);

		const directional = new THREE.DirectionalLight(
			this.config.DirectionalLight,
			1,
		);
		directional.position.set(30, 200, -90);
		scene.add(directional);

		const directional1 = new THREE.DirectionalLight(
			this.config.DirectionalLight1,
			10,
		);
		directional1.position.set(1, 20, -1);
		directional1.lookAt(vzero);
		scene.add(directional1);

		const hemisphere = new THREE.HemisphereLight(
			this.config.HemisphereLight_a,
			this.config.HemisphereLight_b,
			1,
		);
		scene.add(hemisphere);

		this.lights.directional = directional;
		this.lights.directional1 = directional1;
		this.lights.ambient = ambient;
		this.lights.hemisphere = hemisphere;

		const lightsOn = this.config.lights;
		const csm = this.config.cascaded_shadow_maps;
		const shadows = this.config.shadows;
		this._setLightsVisible(lightsOn);

		if (shadows) {
			if (csm) {
				this._runCsm(camera, scene);
			} else {
				directional.castShadow = true;
				directional.shadow.mapSize.width = 4096;
				directional.shadow.mapSize.height = 4096;
				directional.shadow.camera.left = -42;
				directional.shadow.camera.bottom = -42;
				directional.shadow.camera.right = 42;
				directional.shadow.camera.top = 42;
				directional.shadow.camera.far = 10000;
				directional.shadow.bias = 0.0001;
			}
		}
	}

	/**
	 * @param {THREE.PerspectiveCamera} camera
	 * @param {THREE.Scene} scene
	 * @returns {void}
	 */
	_runCsm(camera, scene) {
		const directional = this.lights.directional;
		if (!directional) {
			return;
		}

		const lightDirection = directional.position
			.clone()
			.normalize()
			.negate();
		this.csm = new CSM({
			maxFar: 1000,
			cascades: 6,
			mode: "practical",
			parent: scene,
			shadowMapSize: 2048,
			shadowBias: 0.001,
			lightDirection,
			camera,
			fade: false,
		});
	}

	/**
	 * @param {boolean} enabled
	 * @returns {void}
	 */
	_setLightsVisible(enabled = true) {
		for (const k in this.lights) {
			const light = this.lights[k];
			if (light) {
				light.visible = enabled;
			}
		}
	}

	/**
	 * @param {string|null|undefined} texture
	 * @param {number} color
	 * @returns {void}
	 */
	floorstyle(texture, color) {
		if (!this.plane) {
			return;
		}

		/** @type {THREE.MeshStandardMaterial} */
		const material = this.plane.material;
		material.color.setHex(color);
		if (texture === null) {
			this.plane.visible = false;
			material.map = null;
			material.needsUpdate = true;
			return;
		}

		this.plane.visible = true;
		if (typeof texture === "string") {
			const map = this._assets.file(texture);
			if (map) {
				map.wrapS = THREE.RepeatWrapping;
				map.wrapT = THREE.RepeatWrapping;
			}
			material.map = map;
		} else {
			material.map = null;
		}
		material.needsUpdate = true;
		if (this.csm) {
			this.csm.setupMaterial(material);
		}
	}

	/**
	 * @param {number} color
	 * @param {number} opacity
	 * @returns {void}
	 */
	shadowstyle(color, opacity) {
		if (!this.shadowplane) {
			return;
		}

		/** @type {THREE.ShadowMaterial} */
		const material = this.shadowplane.material;
		material.color.setHex(color);
		material.opacity = opacity;
	}

	/**
	 * @param {boolean} enabled
	 * @returns {void}
	 */
	set_shadows_enabled(enabled) {
		// 2026-06-18, Composer: runtime shadow toggle via render refresh [envsh1]
		this.config.shadows = !!enabled;
		this._render.refresh_shadows_runtime(enabled);
	}

	/**
	 * @param {number} color
	 * @param {number} [glow]
	 * @returns {void}
	 */
	skystyle(color, glow = 1) {
		const scene = this._render.scene;
		if (!scene?.background) {
			return;
		}

		if (scene.background instanceof THREE.Color) {
			scene.background.setHex(color).multiplyScalar(glow);
		}
	}

	/**
	 * @param {number} dt
	 * @returns {void}
	 */
	step(dt, _rdt) {
		this.csm?.update();
	}

	/**
	 * @returns {void}
	 */
	stop() {
		this.plane?.removeFromParent();
		this.shadowplane?.removeFromParent();
		this.plane = null;
		this.shadowplane = null;

		for (const k in this.lights) {
			this.lights[k]?.removeFromParent();
			this.lights[k] = null;
		}

		this.csm?.dispose();
		this.csm = null;
	}
}

export default Environment;
Environment.config = DEFAULT_CONFIG;
// 2026-06-14, Composer: floor shadow plane lights csm port [env1]
// 2026-06-14, Composer: floor plane hidden until floorstyle [env2]
// 2026-06-14, Composer: always create hidden floor plane [env3]
// 2026-06-14, Composer: run renamed start, config-only opts [env4]
// 2026-06-18, Composer: runtime shadow toggle via render refresh [envsh1]
