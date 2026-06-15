import { defineConfig } from "vite";
import plugin_pug from "vite-plugin-pug";
import basicSsl from "@vitejs/plugin-basic-ssl";
import legacy from "@vitejs/plugin-legacy";

/** @type {import('vite').UserConfig} */
export default defineConfig({
  publicDir: "res",
  base: "./",
  plugins: [
    //basicSsl(),
    // 2026-06-14, Composer: rename pureplay to playbox [r7n2p4]
    plugin_pug({ pretty: false }, { name: "playbox" }),
    legacy({
      targets: ["baseline widely available"],
      modernPolyfills: true,
      renderLegacyChunks: false,
      renderModernChunks: true,
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20000,
          groups: [
            {
              name: "vendor",
              test: /node_modules/,
              priority: 2,
            },
            {
              name: 'app',
              test: /src/,
              priority: 1,
              minSize: 100000,
              maxSize: 500000
            },
          ],
        },
      },
    },
  },
  devtools: false,
  // 2026-06-14, Composer: vitest node env for toybox stress tests [tbxst1]
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
// 2026-06-14, Composer: rename pureplay to playbox [r7n2p4]
// 2026-06-14, Composer: vitest node env for toybox stress tests [tbxst1]
