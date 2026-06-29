/** @namespace ty */
// 2026-06-14, Composer: localStorage datawork port from a_legacy [dwrk1]
class Datawork {
	/**
	 * @param {string} namespace
	 */
	constructor(namespace) {
		this.namespace = namespace;
	}

	/**
	 * @param {string} key
	 * @param {string|number} value
	 */
	save(key, value) {
		Datawork.save(this.namespace, key, value);
	}

	/**
	 * @param {string} key
	 * @returns {string|number}
	 */
	load(key) {
		return Datawork.load(this.namespace, key);
	}

	/**
	 * @param {string} namespace
	 * @param {string} key
	 * @param {string|number} value
	 */
	static save(namespace, key, value) {
		localStorage.setItem(`${namespace}-${key}`, String(value));
	}

	/**
	 * @param {string} namespace
	 * @param {string} key
	 * @returns {string|number}
	 */
	static load(namespace, key) {
		const v = localStorage.getItem(`${namespace}-${key}`) ?? 0;
		const val = Number(v);
		if (isNaN(val)) {
			return v;
		}
		return val;
	}
}

export default Datawork;
// 2026-06-14, Composer: localStorage datawork port from a_legacy [dwrk1]
