/** @namespace ty */
// Purpose: in-world arcade screens host sub-cores rendered into model textures.

import * as THREE from "three";

const SCREEN_W = 512;
const SCREEN_H = 256;
const ARCADER_B_MODEL_KEY = "arcader_b";
const _sourceInv = new THREE.Matrix4();
const _screenLocal = new THREE.Matrix4();
const _screenBounds = new THREE.Box3();
const _screenSize = new THREE.Vector3();
const _screenScale = new THREE.Vector3();
const _screenPointer = new THREE.Vector2();
const _screenRaycaster = new THREE.Raycaster();

/**
 * @class ArcadeScreen
 * @memberof pb.play
 */
class ArcadeScreen {
	/**
	 * @param {import("../core/core.js").default} core
	 * @param {number} toyIndex
	 * @param {string} toyKey
	 */
	constructor(core, toyIndex, toyKey) {
		this._core = core;
		this._toy_index = toyIndex;
		this._toy_key = toyKey;
	}

	/** @returns {this} */
	init() {
		/** @type {import("./arcade_subcore.js").default|null} */
		this._subcore = null;
		/** @type {THREE.Mesh|null} */
		this._screen_mesh = null;
		this._screen_slot = this._resolve_screen_slot();
		/** @type {Map<number, { x: number, y: number, downX: number, downY: number }>} */
		this._screen_pointer_states = new Map();
		return this;
	}

	/**
	 * @param {import("./arcade_subcore.js").default} subcore
	 * @returns {this}
	 */
	setSubcore(subcore) {
		this._subcore = subcore;
		return this;
	}

	/** @returns {{ width: number, height: number }} */
	textureSize() {
		return this._resolve_texture_size();
	}

	/** @returns {void} */
	start() {
		// 2026-07-01, GPT-5.5: arcade screen receives external subcore [scrsub1]
		this._attach_screen_mesh();
	}

	/**
	 * @returns {void}
	 */
	step() {
		this._attach_screen_mesh();
	}

	/** @returns {void} */
	stop() {
		this._detach_screen_mesh();
		this._screen_pointer_states.clear();
		this._subcore = null;
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/** @returns {string|null} */
	_resolve_screen_slot() {
		const arcadeConf = this._core.db.get("arcade")?.getconfig(this._toy_key);
		// 2026-07-01, GPT-5.5: screen slot detected from arcade db flag [scrcfg1]
		return arcadeConf?.screen ?? null;
	}

	/**
	 * @returns {{ width: number, height: number }}
	 */
	_resolve_texture_size() {
		const sourceScreen = this._resolve_source_screen_mesh();
		if (!sourceScreen) {
			return { width: SCREEN_W, height: SCREEN_H };
		}

		if (!sourceScreen.geometry.boundingBox) {
			sourceScreen.geometry.computeBoundingBox();
		}
		if (!sourceScreen.geometry.boundingBox) {
			return { width: SCREEN_W, height: SCREEN_H };
		}

		sourceScreen.updateMatrixWorld(true);
		sourceScreen.getWorldScale(_screenScale);
		_screenBounds.copy(sourceScreen.geometry.boundingBox);
		_screenBounds.getSize(_screenSize);
		const dims = [
			_screenSize.x * Math.abs(_screenScale.x),
			_screenSize.y * Math.abs(_screenScale.y),
			_screenSize.z * Math.abs(_screenScale.z),
		]
			.filter((v) => v > 1e-5)
			.sort((a, b) => b - a);
		const w = dims[0] ?? 1;
		const h = dims[1] ?? w;
		const aspect = Math.max(0.25, Math.min(4, w / h));
		const base = SCREEN_W;
		// 2026-07-01, GPT-5.5: screen target size follows source proportions [scrsiz1]
		// 2026-07-01, GPT-5.5: screen target uses min side aspect sizing [scrsiz3]
		// 2026-07-01, GPT-5.5: screen aspect uses non-flat bounds axes [scrsiz4]
		// 2026-07-01, GPT-5.5: screen aspect includes source mesh scale [scrsiz5]
		if (aspect >= 1) {
			return {
				width: Math.round(base * aspect),
				height: base,
			};
		}
		return {
			width: base,
			height: Math.round(base / aspect),
		};
	}

	/**
	 * @returns {THREE.Mesh|null}
	 */
	_resolve_source_screen_mesh() {
		if (!this._screen_slot) {
			return null;
		}
		const modelconf = this._core.db.get("models")?.getconfig(ARCADER_B_MODEL_KEY);
		const gltf = modelconf?.source ? this._core.assets.file(modelconf.source) : null;
		const source = gltf?.scene?.getObjectByName(this._screen_slot);
		if (!source) {
			return null;
		}
		if (source.isMesh) {
			return source;
		}
		let mesh = null;
		source.traverse((node) => {
			if (!mesh && node.isMesh) {
				mesh = node;
			}
		});
		return mesh;
	}

	/** @returns {void} */
	_attach_screen_mesh() {
		if (this._screen_mesh || !this._screen_slot || !this._subcore?.render?.target) {
			return;
		}

		const itemIndex = this._core.toybox.get_item_index(this._toy_index);
		const model = this._core.scene.get_itemmodel(itemIndex);
		if (!model?.root) {
			return;
		}

		const modelconf = this._core.db.get("models")?.getconfig(ARCADER_B_MODEL_KEY);
		const gltf = modelconf?.source ? this._core.assets.file(modelconf.source) : null;
		const sourceRoot = gltf?.scene?.getObjectByName(modelconf?.object);
		const sourceScreen = this._resolve_source_screen_mesh();
		if (!sourceRoot || !sourceScreen) {
			return;
		}

		gltf.scene.updateMatrixWorld(true);
		_screenLocal.copy(sourceScreen.matrixWorld).premultiply(
			_sourceInv.copy(sourceRoot.matrixWorld).invert(),
		);

		const texture = this._subcore.render.target.texture;
		// 2026-07-01, GPT-5.5: screen texture flips x-axis [scrflip1]
		texture.repeat.x = -1;
		texture.offset.x = 1;
		texture.needsUpdate = true;
		const material = new THREE.MeshBasicMaterial({
			map: texture,
			side: THREE.DoubleSide,
			toneMapped: false,
		});
		// 2026-07-01, GPT-5.5: screen target uses normal mesh overlay [scrmesh1]
		this._screen_mesh = new THREE.Mesh(sourceScreen.geometry.clone(), material);
		this._screen_mesh.matrix.copy(_screenLocal);
		this._screen_mesh.matrix.decompose(
			this._screen_mesh.position,
			this._screen_mesh.quaternion,
			this._screen_mesh.scale,
		);
		this._screen_mesh.rotateY(Math.PI * 0.5);
		model.root.add(this._screen_mesh);
	}

	/**
	 * @param {string} channel
	 * @param {{ x: number, y: number, touch_identifier?: number, type?: number, command?: string|null }} detail
	 * @param {import("../core/core.js").default} targetCore
	 * @returns {boolean}
	 */
	forwardPointer(channel, detail, targetCore) {
		if (!this._screen_mesh || !this._subcore?.render) {
			return false;
		}
		const key = detail.touch_identifier ?? 0;
		const camera = this._core.draw.active_camera;
		if (!camera || !this._core.draw.pointer_ndc(detail.x, detail.y, _screenPointer)) {
			this._release_screen_pointer(key, detail, targetCore);
			return false;
		}
		this._screen_mesh.updateMatrixWorld(true);
		_screenRaycaster.setFromCamera(_screenPointer, camera);
		const hit = _screenRaycaster.intersectObject(this._screen_mesh, false)[0];
		if (!hit?.uv) {
			this._release_screen_pointer(key, detail, targetCore);
			return false;
		}
		const local = {
			// 2026-07-01, GPT-5.5: screen texture flips x-axis [scrflip1]
			x: (1 - hit.uv.x) * this._subcore.render.width,
			y: (1 - hit.uv.y) * this._subcore.render.height,
			touch_identifier: key,
			type: detail.type ?? 1,
			command: detail.command ?? null,
			source: "arcader_b_screen",
		};
		// 2026-07-01, GPT-5.5: screen forwards full pointer lifecycle [scrptr2]
		if (channel === "pointer.down") {
			this._screen_pointer_states.set(key, {
				x: local.x,
				y: local.y,
				downX: local.x,
				downY: local.y,
			});
			targetCore.eventsbus.emit(channel, local);
			return true;
		}
		if (channel === "pointer.move") {
			const state = this._screen_pointer_states.get(key);
			targetCore.eventsbus.emit(channel, local);
			if (state) {
				targetCore.eventsbus.emit("pointer.pressedmove", local);
				targetCore.eventsbus.emit("pointer.drag", {
					...local,
					x: local.x - state.downX,
					y: local.y - state.downY,
				});
				state.x = local.x;
				state.y = local.y;
			}
			return true;
		}
		if (channel === "pointer.up") {
			if (!this._screen_pointer_states.has(key)) {
				return false;
			}
			this._screen_pointer_states.delete(key);
		}
		targetCore.eventsbus.emit(channel, local);
		return true;
	}

	/**
	 * @param {number} key
	 * @param {{ touch_identifier?: number, type?: number, command?: string|null }} detail
	 * @param {import("../core/core.js").default} targetCore
	 * @returns {void}
	 */
	_release_screen_pointer(key, detail, targetCore) {
		const state = this._screen_pointer_states.get(key);
		if (!state) {
			return;
		}
		this._screen_pointer_states.delete(key);
		// 2026-07-01, GPT-5.5: screen releases pointer on ray leave [scrptr3]
		targetCore.eventsbus.emit("pointer.up", {
			x: state.x,
			y: state.y,
			touch_identifier: detail.touch_identifier ?? key,
			type: detail.type ?? 1,
			command: detail.command ?? null,
			source: "arcader_b_screen",
		});
	}

	/** @returns {void} */
	_detach_screen_mesh() {
		if (!this._screen_mesh) {
			return;
		}
		this._screen_mesh.removeFromParent();
		this._screen_mesh.geometry.dispose();
		if (Array.isArray(this._screen_mesh.material)) {
			for (let i = 0; i < this._screen_mesh.material.length; i++) {
				this._screen_mesh.material[i].dispose();
			}
		} else {
			this._screen_mesh.material.dispose();
		}
		this._screen_mesh = null;
	}
}

export default ArcadeScreen;
// 2026-07-01, GPT-5.5: arcader screen hosts render-target sub-core [scrcor1]
// 2026-07-01, GPT-5.5: arcader screen reuses loading UI state [scrui1]
// 2026-07-01, GPT-5.5: screen slot detected from arcade db flag [scrcfg1]
// 2026-07-01, GPT-5.5: screen target uses normal mesh overlay [scrmesh1]
// 2026-07-01, GPT-5.5: screen target size follows source proportions [scrsiz1]
// 2026-07-01, GPT-5.5: screen target uses min side aspect sizing [scrsiz3]
// 2026-07-01, GPT-5.5: screen aspect uses non-flat bounds axes [scrsiz4]
// 2026-07-01, GPT-5.5: screen aspect includes source mesh scale [scrsiz5]
// 2026-07-01, GPT-5.5: screen texture flips x-axis [scrflip1]
// 2026-07-01, GPT-5.5: screen forwards full pointer lifecycle [scrptr2]
// 2026-07-01, GPT-5.5: screen releases pointer on ray leave [scrptr3]
// 2026-07-01, GPT-5.5: arcade screen receives external subcore [scrsub1]
