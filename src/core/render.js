/** @namespace ty */
// 2026-06-14, Composer: Three.js renderer replaces PicoGL [t3r8n2]
import * as THREE from "three";
import logger from "../logger.js";

/**
 * @class Render
 * @memberof pb.core
 */
class Render {
  constructor() {
    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;
    /** @type {THREE.Scene|null} */
    this.scene = null;
    /** @type {THREE.PerspectiveCamera|null} */
    this.camera = null;

    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
  }

  init() {
    return this;
  }

  start() {
    // 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
    this.canvas = document.getElementById("canvas_pb");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x66c0dc);

    this.camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    this.camera.position.set(1, 1, 1);
    this.camera.lookAt(0, 0, 0);

    logger.log("Three.js render started");
  }

  stop() {
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  dispose() {
    // 2026-06-14, Composer: stop reverts start, dispose reverts init [rncyc1]
    this.stop();
  }
}

export default Render;
// 2026-06-14, Composer: stop reverts start, dispose reverts init [rncyc1]
// 2026-06-14, Composer: slim render, equalizer moved to draw [drwprt1]
// 2026-06-14, Composer: Three.js renderer replaces PicoGL [t3r8n2]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: move render into src/core [e5a7c1]
