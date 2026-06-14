// 2026-06-14, Composer: import app from src/core [f6b8d2]
import App from "./core/app.js";

/**
 * @param {App} app
 */
function update(app, dt) {
  return app.step(dt * 1e-3);
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
      return;
    }

    t1 = t2;
    loop(app);
  });
}

function main() {
  const element = document.getElementById("app");
  element?.classList.add("active");

  const app = new App();
  app.init().start();

  element?.classList.add("ready");

  loop(app);
}

window.main = main;
// 2026-06-14, Composer: import app from src/core [f6b8d2]
