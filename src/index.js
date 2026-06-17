// 2026-06-14, Composer: import app from src/core [f6b8d2]
// 2026-06-17, Composer: await async start before rAF loop [idxaw1]
import App from "./core/app.js";
import logger from "./logger.js";

const DT_MAX = 100;

/**
 * @param {App} app
 */
function update(app, dt) {
  return app.step(Math.min(dt, DT_MAX) * 1e-3);
}

/**
 * @param {App} app
 */
function loop(app) {
  let t1 = performance.now();

  requestAnimationFrame((time) => {
    const t2 = performance.now();
    const code = update(app, t2 - t1);
    if (code !== 0) {
      logger.log(`App stopped with code ${code}`);
      return;
    }

    t1 = t2;
    loop(app);
  });
}

async function main() {
  const element = document.getElementById("app");
  element?.classList.add("active");

  const app = new App();
  app.init();
  // 2026-06-17, Composer: await async start before rAF loop [idxaw1]
  await app.start();

  element?.classList.add("ready");

  loop(app);
}

window.main = main;
// 2026-06-14, Composer: import app from src/core [f6b8d2]
// 2026-06-17, Composer: await async start before rAF loop [idxaw1]
