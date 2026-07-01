/** @namespace ty */
// Purpose: own in-world arcade emulator screens and their subcore lifecycles.

import MenuFlow from "../flows/menu.js";
import SplashFlow from "../flows/splashscreen.js";
import ArcadeScreen from "./arcade_screen.js";
import ArcadeSubcore from "./arcade_subcore.js";
import Settings from "./settings.js";

/**
 * @typedef {Object} EmulatorInstance
 * @property {number} toyIndex
 * @property {string} toyKey
 * @property {ArcadeScreen} screen
 * @property {ArcadeSubcore} subcore
 * @property {Settings|null} settings
 * @property {MenuFlow|null} menu
 * @property {SplashFlow|null} splash
 * @property {boolean} splashAttached
 * @property {boolean} disposed
 */

/**
 * @class ArcadeEmulator
 * @memberof pb.play
 */
class ArcadeEmulator {
	/**
	 * @param {import("../core/core.js").default} core
	 */
	constructor(core) {
		this._core = core;
	}

	/** @returns {this} */
	init() {
		/** @type {number|null} */
		this._object_registered_id = null;
		/** @type {number|null} */
		this._object_despawned_id = null;
		/** @type {number[]} */
		this._pointer_ids = [];
		/** @type {Map<number, EmulatorInstance>} */
		this._instances = new Map();
		/** @type {Record<number, string>} */
		this._toy_key_by_id = {};
		this._build_toy_key_by_id();
		return this;
	}

	/** @returns {void} */
	start() {
		// 2026-07-01, GPT-5.5: emulator watches registered arcade toys [emuobj1]
		this._object_registered_id = this._core.eventsbus.on(
			"arcade.object_registered",
			this._on_object_registered.bind(this),
		);
		this._object_despawned_id = this._core.eventsbus.on(
			"arcade.object_despawned",
			this._on_object_despawned.bind(this),
		);
		this._listen_pointer_events();
	}

	/**
	 * @param {number} dt
	 * @param {number} rdt
	 * @returns {void}
	 */
	step(dt, rdt) {
		this._instances.forEach((instance) => {
			instance.screen.step();
			instance.subcore.step(dt, rdt);
		});
	}

	/** @returns {void} */
	stop() {
		if (this._object_registered_id != null) {
			this._core.eventsbus.off(this._object_registered_id);
			this._object_registered_id = null;
		}
		if (this._object_despawned_id != null) {
			this._core.eventsbus.off(this._object_despawned_id);
			this._object_despawned_id = null;
		}
		this._unlisten_pointer_events();
		const instances = Array.from(this._instances.values());
		this._instances.clear();
		// 2026-07-01, GPT-5.5: emulator disposes instances idempotently [emulife1]
		for (let i = 0; i < instances.length; i++) {
			const instance = instances[i];
			this._dispose_instance(instance);
		}
	}

	/** @returns {void} */
	dispose() {
		this.stop();
	}

	/** @returns {void} */
	_build_toy_key_by_id() {
		this._toy_key_by_id = {};
		const entry = this._core.db.get("toys");
		if (!entry) {
			return;
		}
		for (const key of entry.getkeys()) {
			const conf = entry.getconfig(key);
			if (conf?.id != null) {
				this._toy_key_by_id[conf.id] = key;
			}
		}
	}

	/**
	 * @param {number} toyIndex
	 * @returns {string|null}
	 */
	_toy_db_key(toyIndex) {
		const conf = this._core.toybox.get_toyconf(toyIndex);
		if (conf?.id == null) {
			return null;
		}
		return this._toy_key_by_id[conf.id] ?? null;
	}

	/**
	 * @param {number} toyIndex
	 * @returns {Record<string, any>|null}
	 */
	_arcade_conf(toyIndex) {
		const toyKey = this._toy_db_key(toyIndex);
		return toyKey ? this._core.db.get("arcade")?.getconfig(toyKey) ?? null : null;
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_object_registered(toyIndex) {
		if (this._instances.has(toyIndex)) {
			return;
		}
		const toyKey = this._toy_db_key(toyIndex);
		const arcadeConf = this._arcade_conf(toyIndex);
		if (!toyKey || !arcadeConf?.screen || arcadeConf.emulator !== "arcade_a") {
			return;
		}
		// 2026-07-01, GPT-5.5: emulator boots arcade_a from db flag [emuboot1]
		const screen = new ArcadeScreen(this._core, toyIndex, toyKey).init();
		const { width, height } = screen.textureSize();
		const subcore = new ArcadeSubcore(this._core, width, height).init();
		subcore.start();
		if (!subcore.core) {
			subcore.dispose();
			return;
		}
		screen.setSubcore(subcore).start();
		const instance = {
			toyIndex,
			toyKey,
			screen,
			subcore,
			settings: null,
			menu: null,
			splash: null,
			splashAttached: false,
			disposed: false,
		};
		this._instances.set(toyIndex, instance);
		this._boot_arcade_a(instance);
	}

	/**
	 * @param {number} toyIndex
	 * @returns {void}
	 */
	_on_object_despawned(toyIndex) {
		const instance = this._instances.get(toyIndex);
		if (!instance) {
			return;
		}
		this._instances.delete(toyIndex);
		this._dispose_instance(instance);
	}

	/**
	 * @param {EmulatorInstance} instance
	 * @returns {void}
	 */
	_boot_arcade_a(instance) {
		const core = instance.subcore.core;
		if (!core) {
			return;
		}
		instance.settings = new Settings(core.datawork);
		instance.menu = new MenuFlow(core, instance.settings).init();
		instance.splash = new SplashFlow(core).init();
		core.flowbus.attach(instance.splash);
		instance.splashAttached = true;
		core.flowbus.detach(instance.splash);
		instance.splashAttached = false;
		instance.settings.start(core);
		core.flowbus.attach(instance.menu);
		// 2026-07-01, GPT-5.5: emulator starts nested readysplash [emuflw1]
		instance.menu.navigate("readysplash");
	}

	/**
	 * @param {EmulatorInstance} instance
	 * @returns {void}
	 */
	_dispose_instance(instance) {
		if (instance.disposed) {
			return;
		}
		instance.disposed = true;
		const core = instance.subcore.core;
		if (core && instance.splashAttached && instance.splash) {
			core.flowbus.detach(instance.splash);
			instance.splashAttached = false;
		}
		instance.menu?.teardown();
		instance.screen.dispose();
		instance.subcore.dispose();
		instance.settings = null;
		instance.menu = null;
		instance.splash = null;
	}

	/** @returns {void} */
	_listen_pointer_events() {
		if (this._pointer_ids.length) {
			return;
		}
		// 2026-07-01, GPT-5.5: emulator forwards parent pointer to screen [emuptr1]
		this._pointer_ids.push(
			this._core.eventsbus.on("pointer.down", (detail) => {
				this._forward_pointer("pointer.down", detail);
			}),
			this._core.eventsbus.on("pointer.up", (detail) => {
				this._forward_pointer("pointer.up", detail);
			}),
			this._core.eventsbus.on("pointer.move", (detail) => {
				this._forward_pointer("pointer.move", detail);
			}),
			this._core.eventsbus.on("pointer.click", (detail) => {
				this._forward_pointer("pointer.click", detail);
			}),
		);
	}

	/** @returns {void} */
	_unlisten_pointer_events() {
		for (let i = 0; i < this._pointer_ids.length; i++) {
			this._core.eventsbus.off(this._pointer_ids[i]);
		}
		this._pointer_ids.length = 0;
	}

	/**
	 * @param {string} channel
	 * @param {{ x: number, y: number, touch_identifier?: number, type?: number, command?: string|null }} detail
	 * @returns {void}
	 */
	_forward_pointer(channel, detail) {
		for (const instance of this._instances.values()) {
			const core = instance.subcore.core;
			if (!core) {
				continue;
			}
			const hit = instance.screen.forwardPointer(channel, detail, core);
			if (hit) {
				// 2026-07-01, GPT-5.5: emulator mirrors parent pointer to subcore [emuptr2]
				return;
			}
		}
	}
}

export default ArcadeEmulator;
// 2026-07-01, GPT-5.5: emulator watches registered arcade toys [emuobj1]
// 2026-07-01, GPT-5.5: emulator boots arcade_a from db flag [emuboot1]
// 2026-07-01, GPT-5.5: emulator starts nested readysplash [emuflw1]
// 2026-07-01, GPT-5.5: emulator forwards parent pointer to screen [emuptr1]
// 2026-07-01, GPT-5.5: emulator mirrors parent pointer to subcore [emuptr2]
