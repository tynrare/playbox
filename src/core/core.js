/** @namespace ty */
import Render from "./render.js";
import Draw from "./draw.js";
import Scene from "./scene.js";
import Assets from "./assets.js";
import DbList from "./db.js";

/**
 * @class Core
 * @memberof pb.core
 */
class Core {
  constructor() {
    this.active = false;
    this.render = new Render();
    // 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
    this.db = new DbList(document.getElementById("app"), "#db_pb");
    this.assets = new Assets(this.db, this.render);
    // 2026-06-14, Composer: unwrap draw ctor args [drwarg1]
    this.draw = new Draw(this.db, this.render, this.assets);
    // 2026-06-14, Composer: Scene facade for model and text [scnfac1]
    this.scene = new Scene(this.draw, this.db, this.assets);
  }

  init() {
    this.render.init();
    this.db.start();
    this.draw.init();
    this.assets.init();
    return this;
  }

  dispose() {
    this.draw.dispose();
    this.assets.dispose();
    this.render.dispose();
  }

  start() {
    this.render.start();
    this.assets.start();
    this.draw.start();
    this.active = true;
  }

  stop() {
    this.active = false;
    this.draw.stop();
    this.assets.stop();
    this.db.stop();
    this.render.stop();
  }

  step(dt) {
    if (!this.active) {
      return 1;
    }

    // 2026-06-14, Composer: draw owns equalizer and compositor render [drwprt1]
    this.draw.step(dt);
    this.scene.step(dt);

    return 0;
  }
}

export default Core;
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
// 2026-06-14, Composer: draw owns equalizer and compositor render [drwprt1]
// 2026-06-14, Composer: unwrap draw ctor args [drwarg1]
// 2026-06-14, Composer: inject deps field, drop core ref [drwcyc1]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
