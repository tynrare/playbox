// 2026-06-14, Composer: import app from src/core [f6b8d2]
// 2026-06-17, Composer: await async start before rAF loop [idxaw1]
// 2026-06-17, Composer: dom preload progress then canvas loop [ldidx1]
// 2026-06-18, Composer: booling loop lerp dt step dt rdt [idxlp1]
import App from "./core/app.js";
import Loop from "./core/loop.js";
import logger from "./logger.js";

const DT_MAX = 100;
const PROGRESS_SYMBOLS = " .:-=+*#%@";

/**
 * @param {App} app
 * @param {Loop} loop
 * @returns {void}
 */
function startLoop(app, loop) {
	// 2026-06-18, Composer: booling loop lerp dt step dt rdt [idxlp1]
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
 * @param {number} loaded
 * @param {number} total
 * @returns {void}
 */
function setPreloadProgress(loaded, total) {
	const symbol = document.getElementById("preload_symbol");
	if (!symbol) {
		return;
	}
	if (total <= 0) {
		symbol.textContent = PROGRESS_SYMBOLS[0];
		return;
	}
	const i = Math.min(
		PROGRESS_SYMBOLS.length - 1,
		Math.floor((loaded / total) * PROGRESS_SYMBOLS.length),
	);
	symbol.textContent = PROGRESS_SYMBOLS[i];
}

async function main() {
	const appEl = document.getElementById("app");
	const preloadEl = document.getElementById("preload");
	appEl?.classList.add("active");

	const app = new App();
	app.init();

	let loopStarted = false;
	const loop = new Loop();
	// 2026-06-17, Composer: dom preload progress then canvas loop [ldidx1]
	await app.start({
		onProgress: setPreloadProgress,
		onCanvasReady: () => {
			preloadEl?.classList.add("done");
			appEl?.classList.add("loading");
			if (!loopStarted) {
				loopStarted = true;
				startLoop(app, loop);
			}
		},
	});

	appEl?.classList.add("ready");
	appEl?.classList.remove("loading");
}

window.main = main;
// 2026-06-14, Composer: import app from src/core [f6b8d2]
// 2026-06-17, Composer: await async start before rAF loop [idxaw1]
// 2026-06-17, Composer: dom preload progress then canvas loop [ldidx1]
// 2026-06-18, Composer: booling loop lerp dt step dt rdt [idxlp1]
