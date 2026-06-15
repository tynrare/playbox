// 2026-06-14, Composer: move db into src/core [c3e5a9]
import { call } from "three/src/nodes/code/FunctionCallNode.js";
import logger from "../logger.js";

/**
 * @constructor
 * @param {HTMLElement} container .
 */
function DbEntry(container, dbkey) {
	this.start = start;
	this.stop = stop;
	/** @type {HTMLElement} */
	const list = container.querySelector(dbkey);
	const keys = [];
	const config = new Map();

	let guids = 0;

	this.getkeys = () => {
		return keys;
	};

	this.getconfig = (key) => {
		return config.get(key);
	};

	this.makeconfig = (key, proto) => {
		if (proto && !this.getconfig(proto)) {
			logger.warn(`DbEntry::makeconfig error. No proto ${proto} exists`);
			return;
		}
		if (this.getconfig(key)) {
			logger.warn(`DbEntry::makeconfig error. Config ${key} already exists`);
		}

		const conf = config.set(key, {});
		if (proto) {
			Object.setPrototypeOf(conf, config[proto]);
		}

		return conf;
	}

	function start() {
		parse();
	}

	function parse() {
		keys.length = 0;

		for (let i = 0; i < list.children.length; i++) {
			const d = list.children[i];
			const name = d.getAttribute("name") ?? "t" + guids++;
			if (!name) {
				continue;
			}

			keys.push(name);
			const conf = {}

			const attributes = d.getAttributeNames();
			for (let i = 0; i < attributes.length; i++) {
				const k = attributes[i];
				const v = d.getAttribute(k);

				if (k === "inherits" && config.get(v)) {
					Object.setPrototypeOf(conf, config.get(v));
				}

				const vv = conf[k] = parsevalue(v);

				if (
					typeof vv === "string" &&
					vv[0] === "[" &&
					vv[vv.length - 1] === "]"
				) {
					const str = vv.substring(1, vv.length - 1);
					const list = str.replaceAll(" ", "").split(",");
					for (const i in list) {
						list[i] = parsevalue(list[i]);
					}
					conf[k] = list;
				}
			}

			config.set(name, conf);
		}
	}

	function parsevalue(v) {
		if (v === "true") {
			return true;
		} else if (v === "false") {
			return false;
		} else if (v == "inf") {
			return Infinity;
		} else if (v == "null") {
			return null;
		} else if (v !== null && v.startsWith("0x")) {
			const vv = parseInt(v);
			return isNaN(vv) ? v : vv;
		} else if (v !== null && v.startsWith("0b")) {
			const vv = parseInt(v.slice(2), 2);
			return isNaN(vv) ? v : vv;
		} else if (v !== null) {
			const vv = parseFloat(v) || parseInt(v);
			return isNaN(vv) ? v : vv;
		}

		return v;
	}

	function stop() {
		keys.length = 0;
		config.clear();
	}

	this.stop = stop;
}

/**
 * @brief holds bunch of db's
 * @constructor
 * @param {HTMLElement} container .
 * @param {string} dbkey .
 */
function DbList(container, dbkey) {
	const db = container.querySelector(dbkey);
	const dblist = db.querySelectorAll("db[name]");
	const list = {};
	const scopes = {};

	function start() {
		for (let i = 0; i < dblist.length; i++) {
			const d = dblist[i];
			const id = d.id;
			if (!id) {
				continue;
			}

			const name = d.getAttribute("name");
			const scope = d.getAttribute("scope");
			const entry = new DbEntry(db, `db#${id}`);
			entry.start();
			list[name] = entry;
			if (scope) {
				if (!scopes[scope]) {
					scopes[scope] = {};
				}
				scopes[scope][name] = entry;
			}
		}
	}

	function stop() {
		for (const k in list) {
			list[k].stop();
			delete list[k];
		}
		for (const k in scopes) {
			for (const kk in scopes[k]) {
				delete scopes[k][kk];
			}
			delete scopes[k];
		}
	}

	/**
	 * @param {string} name
	 * @returns {DbEntry}
	 */
	this.get = (name) => {
		return list[name];
	};

	this.scope = (key, callback) => {
		const scope = scopes[key];
		if (!scope) {
			return;
		}
		for (const k in scope) {
			callback(scope[k]);
		}
	}

	this.list = () => {
		return list;
	}

	this.start = start;
	this.stop = stop;
}

export default DbList;

export { DbEntry, DbList };
// 2026-06-14, Composer: move db into src/core [c3e5a9]
