/** @namespace ty */
// Purpose: toy tag registry and per-entity bitmap storage via module chunk.
// 2026-06-28, Composer: tags module lazy registry and bitmap [tagmod1]
import logger from "../logger.js";
import Module from "./module.js";

const VAR_TAGS_BITMAP_0 = 4;
const VAR_TAGS_WORD_COUNT = 12;
const MAX_TAG_BITS = VAR_TAGS_WORD_COUNT * 16;

/**
 * @class Tags
 * @memberof pb.toys
 */
class Tags extends Module {
	/**
	 * @param {number} module_flag
	 */
	constructor(module_flag) {
		super(module_flag);
		/** @type {Map<string, number>} */
		this._tag_ids = new Map();
		/** @type {string[]} */
		this._tag_names = [];
	}

	/**
	 * @param {string} name
	 * @returns {number|null}
	 */
	register_tag(name) {
		const existing = this._tag_ids.get(name);
		if (existing != null) {
			return existing;
		}
		const id = this._tag_names.length;
		if (id >= MAX_TAG_BITS) {
			logger.error(`Tags::register_tag "${name}" error: registry full (${MAX_TAG_BITS})`);
			return null;
		}
		this._tag_ids.set(name, id);
		this._tag_names.push(name);
		return id;
	}

	/**
	 * @returns {string[]}
	 */
	get_tag_names() {
		return this._tag_names;
	}

	/**
	 * @param {number} index
	 * @param {string} name
	 * @returns {boolean}
	 */
	has_tag(index, name) {
		const id = this._tag_ids.get(name);
		if (id == null) {
			return false;
		}
		return this._get_bit(index, id);
	}

	/**
	 * @param {number} index
	 * @param {string} name
	 * @returns {void}
	 */
	add_tag(index, name) {
		if (!this.has(index)) {
			return;
		}
		const id = this.register_tag(name);
		if (id == null) {
			return;
		}
		this._set_bit(index, id, true);
	}

	/**
	 * @param {number} index
	 * @param {string} name
	 * @returns {void}
	 */
	remove_tag(index, name) {
		const id = this._tag_ids.get(name);
		if (id == null || !this.has(index)) {
			return;
		}
		this._set_bit(index, id, false);
	}

	init_module(_index, moduleindex) {
		for (let w = 0; w < VAR_TAGS_WORD_COUNT; w++) {
			this._blackboard.write_chunk(moduleindex, VAR_TAGS_BITMAP_0 + w, 0);
		}
	}

	configure_module(index, conf) {
		const tags = conf.tags;
		if (!tags) {
			return;
		}
		for (const i in tags) {
			const name = tags[i];
			if (typeof name !== "string") {
				continue;
			}
			this.add_tag(index, name);
		}
	}

	dispose_module(_index, _moduleindex) {}

	/**
	 * @param {number} index
	 * @param {number} tag_id
	 * @returns {boolean}
	 */
	_get_bit(index, tag_id) {
		const moduleindex = this._moduleindex(index);
		if (moduleindex == null) {
			return false;
		}
		const word = tag_id >> 4;
		const bit = tag_id & 15;
		if (word >= VAR_TAGS_WORD_COUNT) {
			return false;
		}
		return this._blackboard.read_chunk_flag(
			moduleindex,
			VAR_TAGS_BITMAP_0 + word,
			bit,
		);
	}

	/**
	 * @param {number} index
	 * @param {number} tag_id
	 * @param {boolean} v
	 * @returns {void}
	 */
	_set_bit(index, tag_id, v) {
		const moduleindex = this._moduleindex(index);
		if (moduleindex == null) {
			return;
		}
		const word = tag_id >> 4;
		const bit = tag_id & 15;
		if (word >= VAR_TAGS_WORD_COUNT) {
			return;
		}
		this._blackboard.write_chunk_flag(
			moduleindex,
			VAR_TAGS_BITMAP_0 + word,
			bit,
			v,
		);
	}
}

export default Tags;
// 2026-06-28, Composer: tags module lazy registry and bitmap [tagmod1]
