/** @namespace ty */
// 2026-06-14, Composer: port a_legacy Inputs without DOM binding [inpdev1]
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

    /** @type {Record<number, { x: number, y: number, touch_identifier: number, type: number }>} */
    this._pointers = {};
    /** @type {Array<{ x: number, y: number, touch_identifier: number, type: number }>} */
    this._pointers_pool = Array.from({ length: 10 }, () => ({
      x: 0,
      y: 0,
      touch_identifier: -1,
      type: 0,
    }));

    /** @type {((ev: PointerEvent) => void)|null} */
    this._on_pointerdown = null;
    /** @type {((ev: PointerEvent) => void)|null} */
    this._on_pointerup = null;
    /** @type {((ev: PointerEvent) => void)|null} */
    this._on_pointermove = null;
    /** @type {((ev: PointerEvent) => void)|null} */
    this._on_pointerrelease = null;
    /** @type {(() => void)|null} */
    this._on_blur = null;
    /** @type {(() => void)|null} */
    this._on_visibility = null;
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

    // 2026-06-29, Composer: pointer events with capture and blur cancel [inpptr1]
    this._on_pointerdown = (ev) => this._pointerdown(ev);
    this._on_pointerup = (ev) => this._pointerup(ev);
    this._on_pointermove = (ev) => this._pointermove(ev);
    this._on_pointerrelease = (ev) => this._pointerrelease(ev);
    this._on_blur = () => this._cancel_active_pointers();
    this._on_visibility = () => {
      if (document.hidden) {
        this._cancel_active_pointers();
      }
    };

    container.addEventListener("pointerdown", this._on_pointerdown, { passive: false });
    container.addEventListener("pointerup", this._on_pointerup, { passive: false });
    container.addEventListener("pointermove", this._on_pointermove, { passive: false });
    container.addEventListener("pointercancel", this._on_pointerrelease, { passive: false });
    container.addEventListener("lostpointercapture", this._on_pointerrelease);
    window.addEventListener("blur", this._on_blur);
    document.addEventListener("visibilitychange", this._on_visibility);
  }

  /**
   * @returns {void}
   */
  stop() {
    this._cancel_active_pointers();

    const container = this._container;
    if (container && this._on_pointerdown) {
      container.removeEventListener("pointerdown", this._on_pointerdown);
      container.removeEventListener("pointerup", this._on_pointerup);
      container.removeEventListener("pointermove", this._on_pointermove);
      container.removeEventListener("pointercancel", this._on_pointerrelease);
      container.removeEventListener("lostpointercapture", this._on_pointerrelease);
    }
    if (this._on_blur) {
      window.removeEventListener("blur", this._on_blur);
    }
    if (this._on_visibility) {
      document.removeEventListener("visibilitychange", this._on_visibility);
    }

    this._on_pointerdown = null;
    this._on_pointerup = null;
    this._on_pointermove = null;
    this._on_pointerrelease = null;
    this._on_blur = null;
    this._on_visibility = null;
    this._pointers = {};
    this._pointers_pool = Array.from({ length: 10 }, () => ({
      x: 0,
      y: 0,
      touch_identifier: -1,
      type: 0,
    }));
  }

  dispose() {
    // 2026-06-14, Composer: stop unbinds listeners, dispose clears init [inpdev4]
    this.stop();
    this.events.dispose();
    this._container = null;
  }

  /**
   * @returns {void}
   */
  _cancel_active_pointers() {
    // 2026-06-29, Composer: synthetic pointerup on focus loss [inpptr1]
    for (const touch_identifier in this._pointers) {
      const pointer = this._pointers[touch_identifier];
      this._onpointerup(
        pointer.x,
        pointer.y,
        Number(touch_identifier),
        pointer.type,
        null,
      );
    }
  }

  /**
   * @param {PointerEvent} ev
   * @returns {number}
   */
  _pointer_type(ev) {
    return ev.pointerType === "touch" ? 0 : 1;
  }

  /**
   * @param {EventTarget|null} target
   * @returns {string|null}
   */
  _pointer_command(target) {
    return target instanceof HTMLElement ? target.id : null;
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
    pointer.type = type;
    this._pointers[touch_identifier] = pointer;

    this._event_detail.x = x;
    this._event_detail.y = y;
    this._event_detail.touch_identifier = touch_identifier;
    this._event_detail.type = type;
    this._event_detail.command = command ?? null;
    this.events.emit("pointerdown", this._event_detail);
  }

  /**
   * @param {PointerEvent} ev
   * @returns {void}
   */
  _pointerdown(ev) {
    this._muteevent(ev);

    const container = this._container;
    if (container && !container.hasPointerCapture(ev.pointerId)) {
      container.setPointerCapture(ev.pointerId);
    }

    this._onpointerdown(
      ev.clientX,
      ev.clientY,
      ev.pointerId,
      this._pointer_type(ev),
      this._pointer_command(ev.target),
    );
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
   * @param {PointerEvent} ev
   * @returns {void}
   */
  _pointerup(ev) {
    this._muteevent(ev);
    this._onpointerup(
      ev.clientX,
      ev.clientY,
      ev.pointerId,
      this._pointer_type(ev),
      this._pointer_command(ev.target),
    );
  }

  /**
   * @param {PointerEvent} ev
   * @returns {void}
   */
  _pointerrelease(ev) {
    // 2026-06-29, Composer: lost capture and cancel release holds [inpptr1]
    this._onpointerup(
      ev.clientX,
      ev.clientY,
      ev.pointerId,
      this._pointer_type(ev),
      this._pointer_command(ev.target),
    );
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
   * @param {PointerEvent} ev
   * @returns {void}
   */
  _pointermove(ev) {
    this._muteevent(ev);
    this._onpointermove(
      ev.clientX,
      ev.clientY,
      ev.pointerId,
      this._pointer_type(ev),
      this._pointer_command(ev.target),
    );
  }
}

export default Inputs;
// 2026-06-29, Composer: pointer events with capture and blur cancel [inpptr1]
// 2026-06-14, Composer: stop unbinds listeners, dispose clears init [inpdev4]
// 2026-06-14, Composer: defer canvas binding to init [inpdev3]
// 2026-06-14, Composer: rename run to start on inputs ui [crn1]
// 2026-06-14, Composer: bind canvas pointer listeners [inpdev2]
// 2026-06-14, Composer: port a_legacy Inputs without DOM binding [inpdev1]
