/** @namespace ty */
// Purpose: pure welds chunk — parent index, dual flags, member list in BB chunks.
// 2026-06-28, Composer: welds module pure chunk tracking [weld1]
import Module from "./module.js";
import { BB_INVALID, VAR_FLAG_DISPOSED } from "../scene/blackboard.js";
import { TOY_INDEX_INVALID } from "../scene/itembox.js";
import { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../core/mempool.js";

const VAR_WELD_ROOT = 4;
const VAR_WELD_FLAGS = 5;
const VAR_WELD_LIST = 6;
const VAR_LIST_COUNT = 4;
const VAR_LIST_NEXT = 5;
const VAR_LIST_DATA_START = 6;
const WELD_FLAG_MEMBER = 0;
const WELD_FLAG_ROOT = 1;

/**
 * @class Welds
 * @memberof pb.toys
 */
class Welds extends Module {
	/**
	 * @param {number} module_flag
	 * @param {import("../core/mempool.js").default} toy_mempool
	 */
	constructor(module_flag, toy_mempool) {
		super(module_flag);
		this._toy_mempool = toy_mempool;
	}

	/**
	 * @param {number} index
	 * @param {number} flag
	 * @returns {boolean}
	 */
	_has_flag(index, flag) {
		const flags = this.read(index, VAR_WELD_FLAGS);
		return (flags & (1 << flag)) !== 0;
	}

	/**
	 * @param {number} index
	 * @param {number} flag
	 * @param {boolean} v
	 * @returns {void}
	 */
	_set_flag(index, flag, v) {
		let flags = this.read(index, VAR_WELD_FLAGS);
		const bit = 1 << flag;
		flags = v ? flags | bit : flags & ~bit;
		this.write(index, VAR_WELD_FLAGS, flags & 0xffff);
	}

	/**
	 * @returns {number}
	 */
	_list_slots_per_chunk() {
		const n = this._blackboard?.chunk_pool?.element_uint16size ?? 0;
		return Math.max(0, n - VAR_LIST_DATA_START);
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	_list_head(index) {
		const head = this.read(index, VAR_WELD_LIST);
		return head === 0xffff ? BB_INVALID : head;
	}

	/**
	 * @param {number} index
	 * @param {number} listChunk
	 * @returns {void}
	 */
	_set_list_head(index, listChunk) {
		this.write(index, VAR_WELD_LIST, listChunk === BB_INVALID ? 0xffff : listChunk & 0xffff);
	}

	/**
	 * @param {number} listChunk
	 * @returns {void}
	 */
	_init_list_chunk(listChunk) {
		const bb = this._blackboard;
		bb.write_chunk(listChunk, VAR_LIST_COUNT, 0);
		bb.write_chunk(listChunk, VAR_LIST_NEXT, 0xffff);
		const slots = this._list_slots_per_chunk();
		for (let i = 0; i < slots; i++) {
			bb.write_chunk(listChunk, VAR_LIST_DATA_START + i, 0xffff);
		}
	}

	/**
	 * @param {number} listChunk
	 * @returns {void}
	 */
	_free_list_chain(listChunk) {
		if (listChunk === BB_INVALID) {
			return;
		}
		const bb = this._blackboard;
		let chunk = listChunk;
		while (chunk !== BB_INVALID) {
			const next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			bb.free_chunk(chunk);
			chunk = next === 0xffff ? BB_INVALID : next;
		}
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	_ensure_list(index) {
		let head = this._list_head(index);
		if (head !== BB_INVALID) {
			return head;
		}
		head = this._blackboard.spawn_chunk();
		if (head === BB_INVALID) {
			return BB_INVALID;
		}
		this._init_list_chunk(head);
		this._set_list_head(index, head);
		return head;
	}

	/**
	 * @param {number} rootIndex
	 * @param {number} flatIndex
	 * @returns {{ chunk: number, slot: number }|null}
	 */
	_flat_slot(rootIndex, flatIndex) {
		if (flatIndex < 0) {
			return null;
		}
		let skip = flatIndex;
		let chunk = this._list_head(rootIndex);
		const bb = this._blackboard;
		while (chunk !== BB_INVALID) {
			const count = bb.read_chunk(chunk, VAR_LIST_COUNT);
			if (skip < count) {
				return { chunk, slot: skip };
			}
			skip -= count;
			const next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			chunk = next === 0xffff ? BB_INVALID : next;
		}
		return null;
	}

	/**
	 * @param {number} moduleindex
	 * @param {number} field
	 * @returns {number}
	 */
	// 2026-06-28, Composer: chunk reads for dispose after slot cleared [weld7]
	_read_at(moduleindex, field) {
		return this._blackboard.read_chunk(moduleindex, field);
	}

	/**
	 * @param {number} moduleindex
	 * @param {number} flag
	 * @returns {boolean}
	 */
	_has_flag_at(moduleindex, flag) {
		const flags = this._read_at(moduleindex, VAR_WELD_FLAGS);
		return (flags & (1 << flag)) !== 0;
	}

	/**
	 * @param {number} moduleindex
	 * @returns {number}
	 */
	_list_head_at(moduleindex) {
		const head = this._read_at(moduleindex, VAR_WELD_LIST);
		return head === 0xffff ? BB_INVALID : head;
	}

	/**
	 * @param {number} moduleindex
	 * @param {number} listChunk
	 * @returns {void}
	 */
	_set_list_head_at(moduleindex, listChunk) {
		this._blackboard.write_chunk(
			moduleindex,
			VAR_WELD_LIST,
			listChunk === BB_INVALID ? 0xffff : listChunk & 0xffff,
		);
	}

	/**
	 * @param {number} moduleindex
	 * @returns {number}
	 */
	_member_count_at(moduleindex) {
		let total = 0;
		let chunk = this._list_head_at(moduleindex);
		const bb = this._blackboard;
		while (chunk !== BB_INVALID) {
			total += bb.read_chunk(chunk, VAR_LIST_COUNT);
			const next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			chunk = next === 0xffff ? BB_INVALID : next;
		}
		return total;
	}

	/**
	 * @param {number} moduleindex
	 * @param {number} i
	 * @returns {number}
	 */
	_get_member_at(moduleindex, i) {
		if (i < 0) {
			return TOY_INDEX_INVALID;
		}
		let skip = i;
		let chunk = this._list_head_at(moduleindex);
		const bb = this._blackboard;
		while (chunk !== BB_INVALID) {
			const count = bb.read_chunk(chunk, VAR_LIST_COUNT);
			if (skip < count) {
				const member = bb.read_chunk(chunk, VAR_LIST_DATA_START + skip);
				return member === 0xffff ? TOY_INDEX_INVALID : member;
			}
			skip -= count;
			const next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			chunk = next === 0xffff ? BB_INVALID : next;
		}
		return TOY_INDEX_INVALID;
	}

	/**
	 * @param {number} moduleindex
	 * @returns {void}
	 */
	_clear_list_at(moduleindex) {
		this._free_list_chain(this._list_head_at(moduleindex));
		this._set_list_head_at(moduleindex, BB_INVALID);
	}

	/**
	 * @param {number} index
	 * @param {number} moduleindex
	 * @returns {void}
	 */
	_flag_dispose_subtree(index, moduleindex) {
		const n = this._member_count_at(moduleindex);
		for (let i = 0; i < n; i++) {
			const member = this._get_member_at(moduleindex, i);
			if (member === TOY_INDEX_INVALID) {
				continue;
			}
			if (this._toy_mempool.read_flag(member, VAR_FLAGS_A, VAR_FLAG_DISPOSED)) {
				continue;
			}
			if (!this._toy_mempool.read_flag(member, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
				continue;
			}
			this._toy_mempool.write_flag(member, VAR_FLAGS_A, VAR_FLAG_DISPOSED, true);
			const memberModule = this._moduleindex(member);
			if (memberModule != null && this._has_flag_at(memberModule, WELD_FLAG_ROOT)) {
				this._flag_dispose_subtree(member, memberModule);
			}
		}
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	get_root(index) {
		const root = this.read(index, VAR_WELD_ROOT);
		return root === 0xffff ? TOY_INDEX_INVALID : root;
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	get_parent(index) {
		return this.get_root(index);
	}

	/**
	 * @param {number} index
	 * @returns {boolean}
	 */
	is_member(index) {
		return this._has_flag(index, WELD_FLAG_MEMBER);
	}

	/**
	 * @param {number} index
	 * @returns {boolean}
	 */
	is_root(index) {
		return this._has_flag(index, WELD_FLAG_ROOT);
	}

	/**
	 * @param {number} index
	 * @returns {number}
	 */
	member_count(index) {
		let total = 0;
		let chunk = this._list_head(index);
		const bb = this._blackboard;
		while (chunk !== BB_INVALID) {
			total += bb.read_chunk(chunk, VAR_LIST_COUNT);
			const next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			chunk = next === 0xffff ? BB_INVALID : next;
		}
		return total;
	}

	/**
	 * @param {number} index
	 * @param {number} i
	 * @returns {number}
	 */
	get_member(index, i) {
		if (i < 0) {
			return TOY_INDEX_INVALID;
		}
		let skip = i;
		let chunk = this._list_head(index);
		const bb = this._blackboard;
		while (chunk !== BB_INVALID) {
			const count = bb.read_chunk(chunk, VAR_LIST_COUNT);
			if (skip < count) {
				const member = bb.read_chunk(chunk, VAR_LIST_DATA_START + skip);
				return member === 0xffff ? TOY_INDEX_INVALID : member;
			}
			skip -= count;
			const next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			chunk = next === 0xffff ? BB_INVALID : next;
		}
		return TOY_INDEX_INVALID;
	}

	/**
	 * @param {number} index
	 * @param {number} childIndex
	 * @returns {boolean}
	 */
	// 2026-06-28, Composer: welds member list in local BB chunks [weld3]
	push_member(index, childIndex) {
		const slots = this._list_slots_per_chunk();
		if (slots <= 0) {
			return false;
		}
		let chunk = this._ensure_list(index);
		if (chunk === BB_INVALID) {
			return false;
		}
		const bb = this._blackboard;
		const value = childIndex & 0xffff;
		for (;;) {
			const count = bb.read_chunk(chunk, VAR_LIST_COUNT);
			if (count < slots) {
				bb.write_chunk(chunk, VAR_LIST_DATA_START + count, value);
				bb.write_chunk(chunk, VAR_LIST_COUNT, count + 1);
				return true;
			}
			let next = bb.read_chunk(chunk, VAR_LIST_NEXT);
			if (next === 0xffff) {
				next = bb.spawn_chunk();
				if (next === BB_INVALID) {
					return false;
				}
				this._init_list_chunk(next);
				bb.write_chunk(chunk, VAR_LIST_NEXT, next);
				chunk = next;
				continue;
			}
			chunk = next;
		}
	}

	/**
	 * @param {number} rootIndex
	 * @param {number} childIndex
	 * @returns {boolean}
	 */
	// 2026-06-28, Composer: welds remove member from root list [weld4]
	remove_member(rootIndex, childIndex) {
		const bb = this._blackboard;
		const value = childIndex & 0xffff;
		const total = this.member_count(rootIndex);
		if (total <= 0) {
			return false;
		}
		let findFlat = -1;
		for (let i = 0; i < total; i++) {
			if (this.get_member(rootIndex, i) === value) {
				findFlat = i;
				break;
			}
		}
		if (findFlat < 0) {
			return false;
		}
		const find = this._flat_slot(rootIndex, findFlat);
		const last = this._flat_slot(rootIndex, total - 1);
		if (!find || !last) {
			return false;
		}
		const lastValue = bb.read_chunk(last.chunk, VAR_LIST_DATA_START + last.slot);
		bb.write_chunk(find.chunk, VAR_LIST_DATA_START + find.slot, lastValue);
		bb.write_chunk(last.chunk, VAR_LIST_DATA_START + last.slot, 0xffff);
		const lastCount = bb.read_chunk(last.chunk, VAR_LIST_COUNT);
		bb.write_chunk(last.chunk, VAR_LIST_COUNT, lastCount - 1);
		return true;
	}

	/**
	 * @param {number} index
	 * @returns {void}
	 */
	clear_list(index) {
		this._free_list_chain(this._list_head(index));
		this._set_list_head(index, BB_INVALID);
	}

	/**
	 * @param {number} index
	 * @param {number} _moduleindex
	 * @returns {void}
	 */
	init_module(index, _moduleindex) {
		this.write(index, VAR_WELD_ROOT, 0xffff);
		this.write(index, VAR_WELD_FLAGS, 0);
		this._set_list_head(index, BB_INVALID);
	}

	/**
	 * @param {number} index
	 * @param {Record<string, any>} conf
	 * @returns {void}
	 */
	configure_module(index, conf) {
		// 2026-06-28, Composer: welds dual root and member flags [weld6]
		if (conf.welds != null) {
			this._set_flag(index, WELD_FLAG_ROOT, true);
		}
		if (conf.weld_root != null && conf.weld_root !== index) {
			this._set_flag(index, WELD_FLAG_MEMBER, true);
			this.write(index, VAR_WELD_ROOT, conf.weld_root & 0xffff);
		}
	}

	/**
	 * @param {number} index
	 * @param {number} _moduleindex
	 * @returns {void}
	 */
	// 2026-06-28, Composer: welds dispose root cascade member cleanup [weld5]
	dispose_module(index, moduleindex) {
		if (this._has_flag_at(moduleindex, WELD_FLAG_ROOT)) {
			this._flag_dispose_subtree(index, moduleindex);
			this._clear_list_at(moduleindex);
		}

		if (!this._has_flag_at(moduleindex, WELD_FLAG_MEMBER)) {
			return;
		}
		const parent = this._read_at(moduleindex, VAR_WELD_ROOT);
		if (parent === 0xffff) {
			return;
		}
		if (this._toy_mempool.read_flag(parent, VAR_FLAGS_A, VAR_FLAG_DISPOSED)) {
			return;
		}
		this.remove_member(parent, index);
	}
}

export default Welds;
export {
	VAR_WELD_ROOT,
	VAR_WELD_FLAGS,
	VAR_WELD_LIST,
	WELD_FLAG_MEMBER,
	WELD_FLAG_ROOT,
};
// 2026-06-28, Composer: welds module pure chunk tracking [weld1]
// 2026-06-28, Composer: welds configure root or member chunk [weld2]
// 2026-06-28, Composer: welds member list in local BB chunks [weld3]
// 2026-06-28, Composer: welds remove member from root list [weld4]
// 2026-06-28, Composer: welds dispose root cascade member cleanup [weld5]
// 2026-06-28, Composer: welds dual root and member flags [weld6]
// 2026-06-28, Composer: chunk reads for dispose after slot cleared [weld7]