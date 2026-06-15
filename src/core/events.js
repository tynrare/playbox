// 2026-06-14, Composer: port booling event bus for inputs [evtb1]
/**
 * @typedef {Object} EventListenerDetails
 * @property {function(any): void} callback
 * @property {string} name
 * @property {number} guid
 */

/**
 * @class Events
 * @memberof pb.core
 */
class Events {
  constructor() {
    this.guids = 0;
    /** @type {Record<string, Record<number, EventListenerDetails>>} */
    this.list = {};
    /** @type {Record<number, EventListenerDetails>} */
    this.clist = {};
  }

  /**
   * @param {string} name
   * @param {function(any): void} callback
   * @returns {number} event id
   */
  on(name, callback) {
    const guid = this.guids++;
    const _callback = (detail) => callback(detail);
    const event = { callback: _callback, name, guid };

    let list = this.list[name];
    if (!list) {
      list = this.list[name] = {};
    }
    list[guid] = event;
    this.clist[guid] = event;

    return guid;
  }

  /**
   * @param {string} name
   * @param {function(any): void} callback
   * @returns {number} event id
   */
  once(name, callback) {
    const id = this.on(name, (...args) => {
      this.off(id);
      callback(...args);
    });
    return id;
  }

  /**
   * @param {number} id event id
   * @returns {void}
   */
  off(id) {
    const event = this.clist[id];
    if (!event) {
      return;
    }

    delete this.list[event.name][id];
    delete this.clist[id];
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    // 2026-06-14, Composer: has channel for gated hot-path emits [evbhp1]
    const list = this.list[name];
    return list != null && Object.keys(list).length > 0;
  }

  /**
   * @param {string} name
   * @param {any} [detail]
   * @returns {void}
   */
  emit(name, detail) {
    const list = this.list[name];
    if (!list) {
      return;
    }

    for (const id in list) {
      const event = list[id];
      event.callback(detail);
    }
  }

  /**
   * @returns {void}
   */
  dispose() {
    for (const guid in this.clist) {
      this.off(Number(guid));
    }
  }
}

export default Events;
// 2026-06-14, Composer: port booling event bus for inputs [evtb1]
// 2026-06-14, Composer: has channel for gated hot-path emits [evbhp1]
