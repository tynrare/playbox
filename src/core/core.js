/** @namespace ty */
import Render from "./render.js";
import Draw from "./draw.js";
import Scene from "./scene.js";
import Assets from "./assets.js";
import DbList from "./db.js";
import Inputs from "./inputs.js";
import EventsBus, { INPUTS_BRIDGE_MAP } from "./eventsbus.js";
import Ui from "./ui.js";
import Lang from "./lang.js";
import Physics from "./physics.js";
import Itembox from "../scene/itembox.js";
import Toybox from "../scene/toybox.js";
import Datawork from "./datawork.js";

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
    // 2026-06-14, Composer: physics before scene for body pool wiring [scnbd2]
    this.physics = new Physics(this.render);
    // 2026-06-14, Composer: eventsbus hub for inputs and ui [evbs1]
    this.eventsbus = new EventsBus();
    // 2026-06-14, Composer: itembox data worker before scene [itmbx1]
    this.itembox = new Itembox(this.db, this.eventsbus);
    // 2026-06-14, Composer: toybox mempool item link blackboard [tbxbb1]
    this.toybox = new Toybox(this.db, this.eventsbus, this.itembox);
    // 2026-06-14, Composer: Scene facade for model and text [scnfac1]
    this.scene = new Scene(
      this.draw,
      this.db,
      this.assets,
      this.physics,
      this.itembox,
      this.eventsbus,
    );
    /** @type {Inputs} */
    this.inputs = new Inputs();
    /** @type {Lang} */
    this.lang = new Lang(this.db);
    /** @type {Ui} */
    this.ui = new Ui(this.scene, this.eventsbus, this.lang);
    // 2026-06-14, Composer: datawork localStorage namespace [dwrk1]
    this.datawork = new Datawork("pb");
  }

  init() {
    this.render.init();
    this.db.start();
    this.draw.init();
    this.assets.init();
    // 2026-06-14, Composer: cache db lang strings by locale key [lng1]
    this.lang.init();
    // 2026-06-14, Composer: defer canvas binding to init [inpdev3]
    this.inputs.init(document.getElementById("canvas_pb"));
    this.eventsbus.register("inputs", this.inputs.events, INPUTS_BRIDGE_MAP);
    return this;
  }

  dispose() {
    // 2026-06-14, Composer: stop then dispose in reverse init order [crcyc1]
    if (this.active) {
      this.stop();
    }
    this.ui.dispose();
    this.eventsbus.dispose();
    this.inputs.dispose();
    this.draw.dispose();
    this.assets.dispose();
    this.lang.stop();
    this.db.stop();
    this.render.dispose();
  }

  start() {
    this.render.start();
    this.assets.start();
    this.draw.start();
    // 2026-06-14, Composer: scene environment floor lights csm [scnenv1]
    this.scene.start();
    // 2026-06-14, Composer: physics and itembox on core [itmbx1]
    this.physics.start();
    this.itembox.start();
    this.toybox.start();
    // 2026-06-14, Composer: rename run to start on inputs ui [crn1]
    this.inputs?.start();
    this.ui?.start();
    this.active = true;
  }

  stop() {
    if (!this.active) {
      return;
    }
    this.active = false;
    // 2026-06-14, Composer: stop reverses start in reverse order [crcyc1]
    this.ui.stop();
    this.inputs.stop();
    this.toybox.stop();
    this.itembox.stop();
    this.physics.stop();
    this.scene.stop();
    this.draw.stop();
    this.assets.stop();
    this.render.stop();
  }

  step(dt) {
    if (!this.active) {
      return 1;
    }

    // 2026-06-14, Composer: draw owns equalizer and compositor render [drwprt1]
    // 2026-06-14, Composer: ui layout before bounds and billboards [crcyc2]
    // 2026-06-14, Composer: itembox step before physics [itmbx1]
    this.itembox.step(dt);
    // 2026-06-14, Composer: toybox step before physics [tbxbb1]
    this.toybox.step(dt);
    // 2026-06-14, Composer: physics before draw for weld sync [crcyc3]
    this.physics.step(dt);
    this.draw.step(dt);
    this.ui?.step(dt);
    this.scene.step(dt);

    return 0;
  }
}

export default Core;
// 2026-06-14, Composer: physics before scene for body pool wiring [scnbd2]
// 2026-06-14, Composer: datawork localStorage namespace [dwrk1]
// 2026-06-14, Composer: physics and itembox on core [itmbx1]
// 2026-06-14, Composer: scene environment floor lights csm [scnenv1]
// 2026-06-14, Composer: cache db lang strings by locale key [lng1]
// 2026-06-14, Composer: stop then dispose in reverse init order [crcyc1]
// 2026-06-14, Composer: Ui takes scene instead of draw db [uiscn1]
// 2026-06-14, Composer: defer canvas binding to init [inpdev3]
// 2026-06-14, Composer: rename run to start on inputs ui [crn1]
// 2026-06-14, Composer: eventsbus hub for inputs and ui [evbs1]
// 2026-06-14, Composer: canvas inputs wired, binding deferred [inpdev1]
// 2026-06-14, Composer: Scene facade for model and text [scnfac1]
// 2026-06-14, Composer: draw owns equalizer and compositor render [drwprt1]
// 2026-06-14, Composer: unwrap draw ctor args [drwarg1]
// 2026-06-14, Composer: inject deps field, drop core ref [drwcyc1]
// 2026-06-14, Composer: rename pp abbreviation to pb [m4k8n1]
// 2026-06-14, Composer: itembox step before physics [itmbx1]
// 2026-06-14, Composer: itembox data worker before scene [itmbx1]
// 2026-06-14, Composer: toybox step before physics [tbxbb1]
// 2026-06-14, Composer: toybox mempool item link blackboard [tbxbb1]
