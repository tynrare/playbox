/** @namespace ty */
// 2026-06-14, Composer: port a_legacy fixed-slot mempool [memp1]
import logger from "../logger.js";
import { clamp } from "../math.js";

const VAR_INDEX = 0;
const VAR_INDEX_L2 = 1;
const VAR_FLAGS_A = 2;
const VAR_FLAG_ACTIVE = 0;

class Mempool {
	constructor() {
		/** @type {ArrayBuffer|null} */
		this.buffer = null;
		/** @type {Uint16Array|null} */
		this.vacantlist = null;
		/** @type {Uint16Array|null} */
		this.tankenlist = null;
		/** @type {Uint16Array|null} */
		this.buffer_reader_ui16 = null;

		this.element_uint8size = 4;
		this.element_uint16size = this.element_uint8size >> 1;
		this.chunk_size = 256;
		this.vacantindex = 0;
		this.takencount = 0;
	}

	get element_bytesize() {
		return this.element_uint8size;
	}

	/**
	 * @param {number} [memsize]
	 * @param {number} [capacity]
	 * @returns {Mempool}
	 */
	init(memsize = this.element_uint8size, capacity = this.chunk_size) {
		if ((memsize & 1) !== 0) {
			logger.error("Mempool::init memsize must be even bytes");
			memsize += 1;
		}
		this.chunk_size = capacity;
		this.element_uint8size = memsize;
		this.element_uint16size = this.element_uint8size >> 1;
		this.buffer = new ArrayBuffer(this.chunk_size * memsize);
		this.buffer_reader_ui16 = new Uint16Array(this.buffer);

		this.vacantlist = new Uint16Array(this.chunk_size);
		for (let i = 0, ii = 1; ii < this.chunk_size; i++, ii++) {
			this.vacantlist[i] = ii;
		}
		this.vacantindex = 0;

		this.tankenlist = new Uint16Array(this.chunk_size);
		this.takencount = 0;

		return this;
	}

	allocate() {
		if (this.takencount + 1 >= this.chunk_size || this.vacantindex >= this.chunk_size - 1) {
			logger.error("Pool out of bounds! Can't allocate another element");
			return null;
		}

		const index = this.vacantlist[this.vacantindex];
		this.tankenlist[this.takencount] = index;

		this.write_ui16(index, VAR_INDEX, index);
		this.write_ui16(index, VAR_INDEX_L2, this.takencount);
		this.write_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE, true);

		this.takencount += 1;
		this.vacantindex += 1;

		return index;
	}

	free(index) {
		if (this.takencount <= 0) {
			return;
		}
		if (!this.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			return;
		}

		this.write_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE, false);
		const index_l2 = this.read_ui16(index, VAR_INDEX_L2);
		if (index_l2 >= this.takencount) {
			logger.error(`Mempool::free invalid index_l2 ${index_l2}`);
			return;
		}

		this.takencount -= 1;
		this.vacantindex -= 1;

		this.tankenlist[index_l2] = this.tankenlist[this.takencount];
		this.write_ui16(this.tankenlist[index_l2], VAR_INDEX_L2, index_l2);
		this.vacantlist[this.vacantindex] = index;
	}

	read_ui16(index, index_field) {
		return this.buffer_reader_ui16[index * this.element_uint16size + index_field];
	}

	read(index, index_field) {
		return this.read_ui16(index, index_field);
	}

	write_ui16(index, index_field, v) {
		this.buffer_reader_ui16[index * this.element_uint16size + index_field] =
			clamp(0, 0xffff, Math.floor(v));
	}

	write(index, index_field, v) {
		this.write_ui16(index, index_field, v);
	}

	read_float(index, index_field) {
		return this.read_ui16(index, index_field) / 0xffff;
	}

	write_float(index, index_field, v) {
		this.write_ui16(index, index_field, Math.floor(v * 0xffff));
	}

	read_flag(index, index_field, index_flag) {
		const val = this.read_ui16(index, index_field);
		const mask = 1 << index_flag;
		return !!(val & mask);
	}

	write_flag(index, index_field, index_flag, v) {
		const val = this.read_ui16(index, index_field);
		const mask = ~(1 << index_flag);
		const newval = (val & mask) | ((v ? 1 : 0) << index_flag);
		this.write_ui16(index, index_field, newval);
	}

	dispose() {
		this.buffer = null;
		this.buffer_reader_ui16 = null;
		this.vacantlist = null;
		this.tankenlist = null;
		this.vacantindex = 0;
		this.takencount = 0;
	}
}

export { Mempool, VAR_INDEX, VAR_INDEX_L2, VAR_FLAGS_A, VAR_FLAG_ACTIVE };
export default Mempool;
// 2026-06-14, Composer: port a_legacy fixed-slot mempool [memp1]
