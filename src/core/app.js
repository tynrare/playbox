/** @namespace ty */
// 2026-06-14, Composer: move app into src/core [a1c3e7]
import Core from "./core.js";
import Play from "../play.js";
import logger from "../logger.js";
import Loader from "./loader.js";

// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
/**
 * @class App
 * @memberof pb.app
 */
class App {
  // 2026-04-30, Codex 5.3: validate app function JSDoc types [b3f91e]
  /**
   * @constructor
   */
  constructor() {
    this.active = false;
    this.ready = false;
    this.core = new Core();
    this.play = new Play(this.core);
  }

  /**
   * @returns {App}
   */
  init() {
    this.active = false;
    this.ready = false;

    this.core.init();
    this.play.init();

    return this;
  }

  /**
   * @returns {void}
   */
  dispose() {
    this.core.dispose();
    this.play.dispose();
  }

  /**
   * @returns {Promise<void>}
   */
  async start() {
    this.active = true;
    await this.core.assets.preload(1);
    this.core.start();
    this.play.splashscreen(true);
    await this.core.assets.preload(2);
    this.play.start();
    this.ready = true;
    // 2026-06-14, Composer: rename pureplay to playbox [r7n2p4]
    logger.log("Playbox App started");
  }

  /**
   * @param {number} dt
   * @returns {number}
   */
  step(dt) {
    if (!this.active) {
      return 1;
    }

    this.core.step(dt);
    if (this.ready) {
      this.play.step(dt);
    }

    return 0;
  }
}

export default App;
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: rename pureplay to playbox [r7n2p4]
// 2026-06-14, Composer: move app into src/core [a1c3e7]
// 2026-04-30, Codex 5.3: validate app function JSDoc types [b3f91e]
