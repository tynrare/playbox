/** @namespace ty */
// App boot phases for boot-launch (steps 5, 10–11). Touchpoint order: src/index.js.
// Scope in: start (l1 + core + splash), startplay (l2 + play attach).
// Scope out: DOM preload, loop, canvas visibility (src/index.js).
// Gateway role: nested | Scope id: boot-scope | Flow id: boot-launch | Upstream gateway: src/index.js
// 2026-06-14, Composer: move app into src/core [a1c3e7]
// 2026-06-17, Composer: flows step in core drop play.step [appflw1]
// 2026-06-17, Composer: app stop unwinds play then core [appstp1]
// 2026-06-17, Composer: boot canvas after preload l1 [ldbt1]
// 2026-06-18, Composer: step passes lerped dt and real dt [appdt1]
// 2026-06-20, Composer: boot launch playbook nested gateway [bootpb1]
import Core from "./core.js";
import Play from "../play.js";
import logger from "../logger.js";

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
  stop() {
    if (!this.active) {
      return;
    }
    // 2026-06-17, Composer: app stop unwinds play then core [appstp1]
    this.play.stop();
    this.core.stop();
    this.active = false;
  }

  /**
   * @returns {void}
   */
  dispose() {
    this.play.dispose();
    this.core.dispose();
  }

  /**
   * @returns {Promise<void>}
   */
  async start() {
    // boot-launch step 5
    // 2026-06-20, Composer: start boot preload l1 and core [appst1]
    this.active = true;
    await this.core.assets.preload(1);
    await this.core.start();
    this.play.splashscreen(true);
  }

  /**
   * @returns {Promise<void>}
   */
  async startplay() {
    // boot-launch step 10
    // 2026-06-20, Composer: startplay preload l2 and attach flows [appsp1]
    await this.core.assets.preload(2);
    // boot-launch step 11
    this.play.start();
    this.ready = true;
    // 2026-06-14, Composer: rename pureplay to playbox [r7n2p4]
    logger.log("Playbox App started");
  }

  /**
   * @param {number} dt
   * @param {number} rdt
   * @returns {number}
   */
  step(dt, rdt = dt) {
    if (!this.active) {
      return 1;
    }

    this.core.step(dt, rdt);

    return 0;
  }
}

export default App;
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: rename pureplay to playbox [r7n2p4]
// 2026-06-14, Composer: move app into src/core [a1c3e7]
// 2026-04-30, Codex 5.3: validate app function JSDoc types [b3f91e]
// 2026-06-17, Composer: flows step in core drop play.step [appflw1]
// 2026-06-17, Composer: app stop unwinds play then core [appstp1]
// 2026-06-17, Composer: boot canvas after preload l1 [ldbt1]
// 2026-06-18, Composer: step passes lerped dt and real dt [appdt1]
// 2026-06-20, Composer: start boot preload l1 and core [appst1]
// 2026-06-20, Composer: startplay preload l2 and attach flows [appsp1]
// 2026-06-20, Composer: boot launch playbook nested gateway [bootpb1]
// 2026-06-29, Composer: await core.start for Rapier init [rphinit1]
