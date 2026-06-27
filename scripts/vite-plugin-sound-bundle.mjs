// Vite plugin: watch dev/res/sound → res/sound audiosprite + Howler JSON
// 2026-06-27, Composer: vite watch + debounced sound bundle [pbxv1]

import path from "node:path";
import {
	DEFAULT_RAW_SOUND_DIR,
	bundleSound,
	soundDirForFile,
} from "./bundle-sound.mjs";

const DEBOUNCE_MS = 300;

/**
 * @param {{ soundRoot?: string, debounceMs?: number }} [opts]
 * @returns {import("vite").Plugin}
 */
export function soundBundlePlugin(opts = {}) {
	const soundRoot = path.resolve(opts.soundRoot ?? DEFAULT_RAW_SOUND_DIR);
	const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;

	/** @type {ReturnType<typeof setTimeout> | null} */
	let debounceTimer = null;
	/** @type {Set<string>} */
	const pendingDirs = new Set();

	/**
	 * @brief Skip bundle when sound source folder is missing or empty.
	 * @param {unknown} err
	 * @returns {boolean}
	 */
	function isSkippableBundleError(err) {
		const msg = String(err?.message ?? err);
		return (
			msg.includes("no audio files") || msg.includes("missing sound dir")
		);
	}

	/**
	 * @param {import("vite").ViteDevServer | null} server
	 * @param {Set<string>} [dirs]
	 * @returns {Promise<void>}
	 */
	function runBundle(server, dirs) {
		const list =
			dirs && dirs.size > 0 ? [...dirs].sort() : [soundRoot];
		return Promise.all(
			list.map((rawInputDir) =>
				bundleSound({ rawInputDir }).catch((err) => {
					if (isSkippableBundleError(err)) {
						return null;
					}
					throw err;
				}),
			),
		)
			.then(() => {
				if (server) {
					server.ws.send({ type: "full-reload" });
				}
			})
			.catch((err) => {
				console.error("[sound-bundle]", err.message ?? err);
			});
	}

	/**
	 * @param {import("vite").ViteDevServer | null} server
	 * @param {string | null} rawInputDir
	 * @returns {void}
	 */
	function scheduleBundle(server, rawInputDir = null) {
		if (rawInputDir) {
			pendingDirs.add(path.resolve(rawInputDir));
		}
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			const dirs = new Set(pendingDirs);
			pendingDirs.clear();
			runBundle(server, dirs);
		}, debounceMs);
	}

	/**
	 * @param {string} file
	 * @param {import("vite").ViteDevServer} server
	 * @returns {void}
	 */
	function onSoundWatchEvent(file, server) {
		const bundleDir = soundDirForFile(file, soundRoot);
		if (!bundleDir) {
			return;
		}
		scheduleBundle(server, bundleDir);
	}

	return {
		name: "sound-bundle",
		enforce: "pre",
		buildStart() {
			return bundleSound({ rawInputDir: soundRoot }).catch((err) => {
				if (isSkippableBundleError(err)) {
					return;
				}
				console.error("[sound-bundle]", err.message ?? err);
				throw err;
			});
		},
		configureServer(server) {
			server.watcher.add(soundRoot);
			// 2026-06-27, Composer: chokidar add/change/unlink outside module graph [pbxv2]
			const handler = (file) => onSoundWatchEvent(file, server);
			server.watcher.on("add", handler);
			server.watcher.on("change", handler);
			server.watcher.on("unlink", handler);
		},
		handleHotUpdate({ file, server }) {
			const bundleDir = soundDirForFile(file, soundRoot);
			if (!bundleDir) {
				return;
			}
			scheduleBundle(server, bundleDir);
			return [];
		},
	};
}

// 2026-06-27, Composer: vite watch + debounced sound bundle [pbxv1]
// 2026-06-27, Composer: chokidar add/change/unlink outside module graph [pbxv2]
