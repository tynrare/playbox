/** @namespace ty */
// 2026-06-14, Composer: port booling Inputs without DOM binding [inpdev1]
import Events from "./events.js";

/**
 * @typedef {Object} PointerEventDetail
 * @property {number} x
 * @property {number} y
 * @property {number} touch_identifier
 * @property {string|null} command
 * @property {number} type
 */

/**
 * @class Inputs
 * @memberof pb.core
 * @emits Inputs#pointerdown
 * @emits Inputs#pointerup
 * @emits Inputs#pointerclick
 * @emits Inputs#pointermove
 * @emits Inputs#pointerpressedmove
 * @emits Inputs#pointerdrag
 */
class Inputs {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;
    /** @type {Events} */
    this.events = new Events();

    /** @type {PointerEventDetail} */
    this._event_detail = {
      x: 0,
      y: 0,
      touch_identifier: 0,
      command: null,
      type: 0,
    };

    /** @type {Record<number, { x: number, y: number, touch_identifier: number }>} */
    this._pointers = {};
    /** @type {Array<{ x: number, y: number, touch_identifier: number }>} */
    this._pointers_pool = Array.from({ length: 10 }, () => ({
      x: 0,
      y: 0,
      touch_identifier: -1,
    }));

    /** @type {((ev: Event) => void)|null} */
    this._on_pointerdown = null;
    /** @type {((ev: Event) => void)|null} */
    this._on_pointerup = null;
    /** @type {((ev: Event) => void)|null} */
    this._on_pointermove = null;
  }

  /**
   * @param {string} key
   * @param {function(PointerEventDetail): void} callback
   * @returns {number}
   */
  on(key, callback) {
    return this.events.on(key, callback);
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  off(id) {
    this.events.off(id);
  }

  /**
   * @param {HTMLElement|null} container
   * @returns {void}
   */
  init(container) {
    // 2026-06-14, Composer: defer canvas binding to init [inpdev3]
    this._container = container;
  }

  /**
   * @returns {void}
   */
  start() {
    // 2026-06-14, Composer: rename run to start on inputs ui [crn1]
    const container = this._container;
    if (!container) {
      return;
    }

    // 2026-06-14, Composer: bind canvas pointer listeners [inpdev2]
    this._on_pointerdown = (ev) => this._pointerdown(ev);
    this._on_pointerup = (ev) => this._pointerup(ev);
    this._on_pointermove = (ev) => this._pointermove(ev);

    container.addEventListener("mousedown", this._on_pointerdown, { passive: false });
    container.addEventListener("touchstart", this._on_pointerdown, { passive: false });
    container.addEventListener("mouseup", this._on_pointerup, { passive: false });
    container.addEventListener("touchend", this._on_pointerup, { passive: false });
    container.addEventListener("touchmove", this._on_pointermove, { passive: false });
    container.addEventListener("mousemove", this._on_pointermove, { passive: false });
  }

  /**
   * @returns {void}
   */
  stop() {
    const container = this._container;
    if (container && this._on_pointerdown) {
      container.removeEventListener("mousedown", this._on_pointerdown);
      container.removeEventListener("touchstart", this._on_pointerdown);
      container.removeEventListener("mouseup", this._on_pointerup);
      container.removeEventListener("touchend", this._on_pointerup);
      container.removeEventListener("touchmove", this._on_pointermove);
      container.removeEventListener("mousemove", this._on_pointermove);
    }

    this._on_pointerdown = null;
    this._on_pointerup = null;
    this._on_pointermove = null;
    this._pointers = {};
    this._pointers_pool = Array.from({ length: 10 }, () => ({
      x: 0,
      y: 0,
      touch_identifier: -1,
    }));
  }

  dispose() {
    // 2026-06-14, Composer: stop unbinds listeners, dispose clears init [inpdev4]
    this.stop();
    this.events.dispose();
    this._container = null;
  }

  /**
   * @param {EventTarget|null} target
   * @returns {boolean}
   */
  _allowsDefaultPointerBehavior(target) {
    const el =
      target instanceof Element
        ? target
        : target instanceof Text
          ? target.parentElement
          : null;
    if (!el) {
      return false;
    }
    const tag = el.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "BUTTON"
    ) {
      return true;
    }
    if (el.closest("a[href]")) {
      return true;
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      return true;
    }
    return false;
  }

  /**
   * @param {Event} ev
   * @returns {void}
   */
  _muteevent(ev) {
    if (this._allowsDefaultPointerBehavior(ev.target)) {
      return;
    }
    const target = ev.target;
    if (
      target instanceof HTMLElement &&
      !target.getAttribute("href") &&
      target.tagName !== "INPUT"
    ) {
      ev.preventDefault();
    }
    ev.stopImmediatePropagation();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} touch_identifier
   * @param {number} type
   * @param {string|null} [command]
   * @returns {void}
   */
  _onpointerdown(x, y, touch_identifier, type, command) {
    const pointer = this._pointers_pool.pop();
    if (!pointer) {
      return;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.touch_identifier = touch_identifier;
    this._pointers[touch_identifier] = pointer;

    this._event_detail.x = x;
    this._event_detail.y = y;
    this._event_detail.touch_identifier = touch_identifier;
    this._event_detail.type = type;
    this._event_detail.command = command ?? null;
    this.events.emit("pointerdown", this._event_detail);
  }

  /**
   * @param {PointerEvent|TouchEvent|MouseEvent} ev
   * @returns {void}
   */
  _pointerdown(ev) {
    this._muteevent(ev);

    if (ev.changedTouches?.length) {
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const x = ev.changedTouches[i].clientX;
        const y = ev.changedTouches[i].clientY;
        const touch_identifier = ev.changedTouches[i].identifier;
        const command =
          ev.target instanceof HTMLElement ? ev.target.id : null;
        this._onpointerdown(x, y, touch_identifier, 0, command);
      }
    } else {
      const x = ev.clientX;
      const y = ev.clientY;
      const touch_identifier = 0xf;
      const command =
        ev.target instanceof HTMLElement ? ev.target.id : null;
      this._onpointerdown(x, y, touch_identifier, 1, command);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} touch_identifier
   * @param {number} type
   * @param {string|null} [command]
   * @returns {void}
   */
  _onpointerup(x, y, touch_identifier, type, command) {
    const pointer = this._pointers[touch_identifier];
    if (!pointer) {
      return;
    }

    delete this._pointers[touch_identifier];
    this._pointers_pool.push(pointer);

    const pdx = pointer.x;
    const pdy = pointer.y;
    const len = Math.sqrt((x - pdx) ** 2 + (y - pdy) ** 2);

    this._event_detail.x = x;
    this._event_detail.y = y;
    this._event_detail.touch_identifier = touch_identifier;
    this._event_detail.type = type;
    this._event_detail.command = command ?? null;
    this.events.emit("pointerup", this._event_detail);

    if (len > 10) {
      return;
    }

    this.events.emit("pointerclick", this._event_detail);
  }

  /**
   * @param {PointerEvent|TouchEvent|MouseEvent} ev
   * @returns {void}
   */
  _pointerup(ev) {
    this._muteevent(ev);

    if (ev.changedTouches?.length) {
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const x = ev.changedTouches[i].clientX;
        const y = ev.changedTouches[i].clientY;
        const touch_identifier = ev.changedTouches[i].identifier;
        const command =
          ev.target instanceof HTMLElement ? ev.target.id : null;
        this._onpointerup(x, y, touch_identifier, 0, command);
      }
    } else {
      const x = ev.clientX;
      const y = ev.clientY;
      const touch_identifier = 0xf;
      const command =
        ev.target instanceof HTMLElement ? ev.target.id : null;
      this._onpointerup(x, y, touch_identifier, 1, command);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} touch_identifier
   * @param {number} type
   * @param {string|null} [command]
   * @returns {void}
   */
  _onpointermove(x, y, touch_identifier, type, command) {
    this._event_detail.x = x;
    this._event_detail.y = y;
    this._event_detail.touch_identifier = touch_identifier;
    this._event_detail.type = type;
    this._event_detail.command = command ?? null;
    this.events.emit("pointermove", this._event_detail);

    const pointer = this._pointers[touch_identifier];
    if (pointer) {
      this.events.emit("pointerpressedmove", this._event_detail);
      const pdx = pointer.x;
      const pdy = pointer.y;
      this._event_detail.x = x - pdx;
      this._event_detail.y = y - pdy;
      this.events.emit("pointerdrag", this._event_detail);
    }
  }

  /**
   * @param {PointerEvent|TouchEvent|MouseEvent} ev
   * @returns {void}
   */
  _pointermove(ev) {
    this._muteevent(ev);

    if (ev.changedTouches?.length) {
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const x = ev.changedTouches[i].clientX;
        const y = ev.changedTouches[i].clientY;
        const touch_identifier = ev.changedTouches[i].identifier;
        const command =
          ev.target instanceof HTMLElement ? ev.target.id : null;
        this._onpointermove(x, y, touch_identifier, 0, command);
      }
    } else {
      const x = ev.clientX;
      const y = ev.clientY;
      const touch_identifier = 0xf;
      const command =
        ev.target instanceof HTMLElement ? ev.target.id : null;
      this._onpointermove(x, y, touch_identifier, 1, command);
    }
  }
}

export default Inputs;
// 2026-06-14, Composer: stop unbinds listeners, dispose clears init [inpdev4]
// 2026-06-14, Composer: defer canvas binding to init [inpdev3]
// 2026-06-14, Composer: rename run to start on inputs ui [crn1]
// 2026-06-14, Composer: bind canvas pointer listeners [inpdev2]
// 2026-06-14, Composer: port booling Inputs without DOM binding [inpdev1]
