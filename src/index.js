// Boot entry gateway: DOM preload messages, loop ownership, app boot phase order.
// Scope in: preload overlay, #app/canvas visibility, rAF loop, main() orchestration.
// Scope out: core/play boot internals (src/core/app.js), asset registry (assets.js).
// Related: index.html, index.less, src/core/app.js, src/core/loop.js
// Gateway role: index | Scope id: boot-scope | Flow id: boot-launch
// Downstream gateways: src/core/app.js (boot-launch steps 5, 10–11)
//
// boot-launch flow:
// 1) index.html → preload_msg "loading" before JS
// 2) main → setPreloadMessage "starting"
// 3) main → #app.active; App.init; Loop alloc
// 4) main → setPreloadMessage "booting"
// 5) app.start → l1 preload, core.start, splash ui_loading (app.js step 5)
// 6) main → #app.ready so canvas is displayable
// 7) main → bootDraw one app.step paints ui_loading on canvas
// 8) main → #preload.done hides dom overlay
// 9) main → startLoop rAF drives app.step
// 10) app.startplay → l2 preload; loop keeps ui_loading visible (app.js step 10)
// 11) app.startplay → play.start clears splash; app.ready (app.js step 11)
// Branches / invariants: loop owned here not App; .ready before bootDraw;
//   bootDraw before preload hide; splash until play.start inside startplay
// 2026-06-14, Composer: import app from src/core [f6b8d2]
// 2026-06-18, Composer: a_legacy loop lerp dt step dt rdt [idxlp1]
// 2026-06-20, Composer: boot launch playbook gateway index [bootpb1]
import App from "./core/app.js";
import Loop from "./core/loop.js";
import logger from "./logger.js";

const DT_MAX = 100;

/**
 * @param {App} app
 * @param {Loop} loop
 * @returns {void}
 */
function startLoop(app, loop) {
	// 2026-06-18, Composer: a_legacy loop lerp dt step dt rdt [idxlp1]
	loop.maxdt = DT_MAX;
	loop.step = (dt, rdt) => {
		const code = app.step(dt, rdt);
		if (code !== 0) {
			logger.log(`App stopped with code ${code}`);
			loop.stop();
		}
	};
	loop.run();
}

/**
 * @param {string} text
 * @returns {void}
 */
function setPreloadMessage(text) {
	const msg = document.getElementById("preload_msg");
	if (msg) {
		msg.textContent = text;
	}
}

async function main() {
	// boot-launch step 2
	setPreloadMessage("starting");

	const appEl = document.getElementById("app");
	const preloadEl = document.getElementById("preload");
	// boot-launch step 3
	appEl?.classList.add("active");

	const app = new App();
	app.init();
	const loop = new Loop();

	// boot-launch step 4
	setPreloadMessage("booting");
	// boot-launch step 5
	await app.start();
	// boot-launch step 6
	appEl?.classList.add("ready");
	app.step(16e-3);
	// boot-launch step 8
	preloadEl?.classList.add("done");
	// boot-launch step 9
	startLoop(app, loop);
	// boot-launch steps 10–11
	await app.startplay();
}

window.main = main;

function boot() {
	// 2026-06-29, Composer: boot after module load not DOMContentLoaded race [idxbt1]
	document.body.classList.add("active");
	void main().catch((err) => {
		logger.error(err);
		setPreloadMessage(String(err?.message ?? err));
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot);
} else {
	boot();
}
// 2026-06-14, Composer: import app from src/core [f6b8d2]
// 2026-06-18, Composer: a_legacy loop lerp dt step dt rdt [idxlp1]
// 2026-06-20, Composer: boot launch playbook gateway index [bootpb1]
// 2026-06-20, Composer: one step draws ui_loading before preload hide [idxdr1]
// 2026-06-29, Composer: boot after module load not DOMContentLoaded race [idxbt1]
