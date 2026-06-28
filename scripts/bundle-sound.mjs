// Bundle dev/res/sound → res/sound audiosprite + Howler v2 JSON
// 2026-06-27, Composer: playbox sound bundle script [pbxs1]
// Requires: npm install audiosprite ffmpeg-static (devDependencies)

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const audiosprite = promisify(require("audiosprite"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
export const DEV_RES = path.join(ROOT, "dev", "res");
export const RES = path.join(ROOT, "res");
export const DEFAULT_RAW_SOUND_DIR = path.join(DEV_RES, "sound");
/** @type {string[]} Lowercase extensions accepted in dev/res/sound bundles. */
export const SOUND_EXTENSIONS = [
	".ogg",
	".mp3",
	".wav",
	".m4a",
	".webm",
	".flac",
	".aac",
];
/** @type {string} Default audiosprite export list for web playback. */
export const DEFAULT_SOUND_EXPORT = "webm,ogg,mp3";
/** @type {number} Default volume multiplier when bundle.txt has no entry. */
export const DEFAULT_SOUND_BOOST = 1.0;
/** @type {string} Optional per-clip volume map in a sound bundle folder. */
export const BUNDLE_TXT_NAME = "bundle.txt";
/** @type {string} Suffix for stored source hash beside bundled outputs in res/sound. */
export const SOURCES_HASH_SUFFIX = ".sources.hash";

/**
 * @brief Resolve ffmpeg binary (ffmpeg-static or PATH).
 * @returns {string}
 */
export function resolveFfmpegPath() {
	try {
		const ffmpegPath = require("ffmpeg-static");
		if (ffmpegPath) {
			return ffmpegPath;
		}
	} catch {
		// fall through to PATH lookup
	}
	return "ffmpeg";
}

/**
 * @brief Prepend ffmpeg-static to PATH when bundled ffmpeg is available.
 * @returns {void}
 */
export function ensureFfmpegOnPath() {
	try {
		const ffmpegPath = require("ffmpeg-static");
		if (!ffmpegPath) {
			return;
		}
		const dir = path.dirname(ffmpegPath);
		const parts = (process.env.PATH ?? "").split(path.delimiter);
		if (!parts.includes(dir)) {
			process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
		}
	} catch {
		// system ffmpeg may still be on PATH
	}
}

/**
 * @brief Sorted audio filenames in a dev/res/sound folder.
 * @param {string} inputDir
 * @returns {string[]}
 */
export function listBundleSoundFiles(inputDir) {
	return fs
		.readdirSync(inputDir)
		.filter((f) => SOUND_EXTENSIONS.includes(path.extname(f).toLowerCase()))
		.sort();
}

/**
 * @brief Audio basename without extension for bundle.txt matching.
 * @param {string} filePath
 * @returns {string}
 */
export function audioBaseName(filePath) {
	return path.basename(filePath, path.extname(filePath));
}

/**
 * @typedef {{ boost: number, crop: { start: number, stop: number } | null }} BundleClipOptions
 */

/**
 * @brief Default bundle.txt options for one clip.
 * @returns {BundleClipOptions}
 */
export function defaultBundleClipOptions() {
	return { boost: DEFAULT_SOUND_BOOST, crop: null };
}

/**
 * @brief Per-clip boost/crop options from bundle.txt in a sound folder.
 * Lines: `<audio-basename> boost=<number>` and/or `crop=<start>,<stop>` (seconds).
 * @param {string} inputDir
 * @returns {Map<string, BundleClipOptions>}
 */
// 2026-06-28, Composer: bundle.txt crop start/stop seconds [pbxs4]
export function readBundleTxtOptions(inputDir) {
	const options = new Map();
	const file = path.join(inputDir, BUNDLE_TXT_NAME);
	if (!fs.existsSync(file)) {
		return options;
	}
	const text = fs.readFileSync(file, "utf8");
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const m = trimmed.match(/^(\S+)\s+(.+)$/);
		if (!m) {
			console.warn(
				`bundle-sound: skip bundle.txt line in ${path.relative(ROOT, inputDir)}: ${trimmed}`,
			);
			continue;
		}
		const clip = defaultBundleClipOptions();
		let matched = false;
		const boostM = m[2].match(/boost=([0-9.]+)/i);
		if (boostM) {
			clip.boost = Number(boostM[1]);
			matched = true;
		}
		const cropM = m[2].match(/crop=([0-9.]+)\s*,\s*([0-9.]+)/i);
		if (cropM) {
			const start = Number(cropM[1]);
			const stop = Number(cropM[2]);
			if (Number.isFinite(start) && Number.isFinite(stop) && stop > start) {
				clip.crop = { start, stop };
				matched = true;
			} else {
				console.warn(
					`bundle-sound: invalid crop in ${path.relative(ROOT, inputDir)}: ${trimmed}`,
				);
			}
		}
		if (!matched) {
			console.warn(
				`bundle-sound: skip bundle.txt line in ${path.relative(ROOT, inputDir)}: ${trimmed}`,
			);
			continue;
		}
		options.set(m[1], clip);
	}
	return options;
}

/**
 * @brief Resolve bundle.txt options keyed by audio basename.
 * @param {Map<string, BundleClipOptions>} bundleOptions
 * @param {string} fileBase audio basename without extension
 * @returns {BundleClipOptions}
 */
export function resolveBundleClipOptions(bundleOptions, fileBase) {
	return bundleOptions.get(fileBase) ?? defaultBundleClipOptions();
}

/**
 * @brief True when bundle.txt requests crop and/or volume boost for one clip.
 * @param {BundleClipOptions} opts
 * @returns {boolean}
 */
export function needsSoundPreprocess(opts) {
	return opts.crop !== null || opts.boost !== DEFAULT_SOUND_BOOST;
}

/**
 * @brief Apply crop and/or linear volume boost to one clip via ffmpeg.
 * @param {string} inputPath
 * @param {BundleClipOptions} opts
 * @param {string} tempDir
 * @returns {string}
 */
export function preprocessSoundClip(inputPath, opts, tempDir) {
	if (!needsSoundPreprocess(opts)) {
		return inputPath;
	}
	const outPath = path.join(tempDir, `${audioBaseName(inputPath)}.wav`);
	const args = ["-y", "-i", inputPath];
	if (opts.crop) {
		args.push("-ss", String(opts.crop.start), "-to", String(opts.crop.stop));
	}
	if (opts.boost !== DEFAULT_SOUND_BOOST) {
		args.push("-filter:a", `volume=${opts.boost}`);
	}
	args.push("-ar", "44100", "-ac", "1", outPath);
	execFileSync(resolveFfmpegPath(), args, { stdio: "pipe" });
	return outPath;
}

/**
 * @brief Short log label for one preprocessed clip.
 * @param {BundleClipOptions} opts
 * @returns {string}
 */
export function formatPreprocessLabel(opts) {
	const parts = [];
	if (opts.crop) {
		parts.push(`crop ${opts.crop.start}–${opts.crop.stop}s`);
	}
	if (opts.boost !== DEFAULT_SOUND_BOOST) {
		parts.push(`x${opts.boost}`);
	}
	return parts.join(", ");
}

/**
 * @brief Map source clips to cropped/boosted temp copies when bundle.txt requests it.
 * @param {string} inputDir
 * @param {string[]} files absolute paths sorted like listBundleSoundFiles
 * @returns {{ files: string[], cleanup: () => void }}
 */
export function prepareSoundFilesForBundle(inputDir, files) {
	const bundleOptions = readBundleTxtOptions(inputDir);
	let tempDir = null;
	const prepared = files.map((file) => {
		const opts = resolveBundleClipOptions(bundleOptions, audioBaseName(file));
		if (!needsSoundPreprocess(opts)) {
			return file;
		}
		if (!tempDir) {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-sound-"));
		}
		const out = preprocessSoundClip(file, opts, tempDir);
		console.log(
			`bundle-sound: ${formatPreprocessLabel(opts)} ${audioBaseName(file)} → ${path.basename(out)}`,
		);
		return out;
	});
	return {
		files: prepared,
		cleanup: () => {
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		},
	};
}

/**
 * @brief Resolve dev/res/sound bundle dir for a changed audio file.
 * @param {string} file
 * @param {string} [soundRoot]
 * @returns {string | null}
 */
export function soundDirForFile(file, soundRoot = DEFAULT_RAW_SOUND_DIR) {
	const resolved = path.resolve(file);
	const root = path.resolve(soundRoot);
	const rel = path.relative(root, resolved);
	if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
		return null;
	}
	const ext = path.extname(resolved).toLowerCase();
	const base = path.basename(resolved);
	if (base !== BUNDLE_TXT_NAME && !SOUND_EXTENSIONS.includes(ext)) {
		return null;
	}
	const parts = rel.split(path.sep);
	return parts.length === 1 ? root : path.join(root, parts[0]);
}

/**
 * @brief Map dev/res/sound → res/sound/sound.{webm,ogg,mp3,json}.
 * @param {string} rawInputDir absolute or relative dir with source clips
 * @param {string} [root] project root
 * @returns {{ inputDir: string, outputBase: string, bundleName: string, jsonResPath: string, outDir: string }}
 */
// 2026-06-27, Composer: dev/res/sound → res/sound mirror [pbxs2]
export function resolveSoundBundlePaths(rawInputDir, root = ROOT) {
	const inputDir = path.resolve(root, rawInputDir);
	const rel = path.relative(DEV_RES, inputDir);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(
			`bundle-sound: input must live under dev/res (${inputDir})`,
		);
	}
	const bundleName = path.basename(inputDir);
	const outDir = path.join(root, "res", "sound");
	const outputBase = path.join(outDir, bundleName);
	const jsonResPath = "sound/";
	return { inputDir, outputBase, bundleName, jsonResPath, outDir };
}

/**
 * @brief Path to stored source hash for one bundle output base.
 * @param {string} outputBase
 * @returns {string}
 */
export function sourcesHashPath(outputBase) {
	return `${outputBase}${SOURCES_HASH_SUFFIX}`;
}

/**
 * @brief Parse audiosprite export list into file extensions.
 * @param {string} [exportFormats]
 * @returns {string[]}
 */
export function listBundleOutputFormats(exportFormats = DEFAULT_SOUND_EXPORT) {
	return exportFormats
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/**
 * @brief True when json + every export audio file exists for a bundle.
 * @param {string} outputBase
 * @param {string} [exportFormats]
 * @returns {boolean}
 */
export function bundleOutputsExist(outputBase, exportFormats = DEFAULT_SOUND_EXPORT) {
	if (!fs.existsSync(`${outputBase}.json`)) {
		return false;
	}
	return listBundleOutputFormats(exportFormats).every((ext) =>
		fs.existsSync(`${outputBase}.${ext}`),
	);
}

/**
 * @brief Mix bundle.txt full content into a sources hash (any edit invalidates cache).
 * @param {import("node:crypto").Hash} h
 * @param {string} inputDir
 * @returns {void}
 */
// 2026-06-28, Composer: source hash uses file size + bundle.txt content [pbxs5]
export function hashBundleTxtSources(h, inputDir) {
	const bundleTxt = path.join(inputDir, BUNDLE_TXT_NAME);
	h.update("bundle.txt\0");
	if (fs.existsSync(bundleTxt)) {
		h.update(fs.readFileSync(bundleTxt));
	}
	h.update("\0");
}

/**
 * @brief Mix one source clip basename + size into a sources hash.
 * @param {import("node:crypto").Hash} h
 * @param {string} file absolute path
 * @returns {void}
 */
export function hashSoundFileSources(h, file) {
	const stat = fs.statSync(file);
	h.update(path.basename(file));
	h.update("\0");
	h.update(String(stat.size));
	h.update("\0");
}

/**
 * @brief Fingerprint dev/res/sound clips + bundle.txt + bundle options.
 * @param {string} inputDir
 * @param {string[]} sourceFiles absolute paths sorted like listBundleSoundFiles
 * @param {{ export?: string, gap?: number }} [opts]
 * @returns {string}
 */
export function computeSourcesHash(inputDir, sourceFiles, opts = {}) {
	const exportFormats = opts.export ?? DEFAULT_SOUND_EXPORT;
	const gap = opts.gap ?? 1;
	const h = crypto.createHash("sha256");
	h.update(`v2\0export=${exportFormats}\0gap=${gap}\0`);
	hashBundleTxtSources(h, inputDir);
	for (const file of sourceFiles) {
		hashSoundFileSources(h, file);
	}
	return h.digest("hex");
}

/**
 * @brief Read stored source hash from res/sound when present.
 * @param {string} outputBase
 * @returns {string | null}
 */
export function readStoredSourcesHash(outputBase) {
	const file = sourcesHashPath(outputBase);
	if (!fs.existsSync(file)) {
		return null;
	}
	return fs.readFileSync(file, "utf8").trim() || null;
}

/**
 * @brief Persist source hash beside bundled outputs in res/sound.
 * @param {string} outputBase
 * @param {string} hash
 * @returns {void}
 */
export function writeStoredSourcesHash(outputBase, hash) {
	fs.writeFileSync(sourcesHashPath(outputBase), `${hash}\n`);
}

/**
 * @brief Normalize Howler JSON src paths to forward slashes.
 * @param {{ src?: string[] }} spriteJson
 * @returns {{ src?: string[] }}
 */
export function normalizeHowlerJsonPaths(spriteJson) {
	if (Array.isArray(spriteJson.src)) {
		spriteJson.src = spriteJson.src.map((entry) =>
			String(entry).replace(/\\/g, "/"),
		);
	}
	return spriteJson;
}

/**
 * @brief Concat dev/res/sound clips into one audiosprite + Howler v2 JSON in res/sound.
 * @param {{ rawInputDir?: string, root?: string, export?: string, gap?: number }} [opts]
 * @returns {Promise<{ name: string, clips: number, jsonPath: string, outDir: string, sprite: object, skipped?: boolean }>}
 */
export async function bundleSound(opts = {}) {
	ensureFfmpegOnPath();
	const root = opts.root ?? ROOT;
	const paths = resolveSoundBundlePaths(
		opts.rawInputDir ?? DEFAULT_RAW_SOUND_DIR,
		root,
	);
	const { inputDir, outputBase, bundleName, jsonResPath, outDir } = paths;

	if (!fs.existsSync(inputDir)) {
		throw new Error(`bundle-sound: missing sound dir ${inputDir}`);
	}

	const sourceFiles = listBundleSoundFiles(inputDir).map((f) =>
		path.join(inputDir, f),
	);
	if (sourceFiles.length === 0) {
		throw new Error(`bundle-sound: no audio files in ${inputDir}`);
	}

	const exportFormats = opts.export ?? DEFAULT_SOUND_EXPORT;
	const gap = opts.gap ?? 1;
	const sourcesHash = computeSourcesHash(inputDir, sourceFiles, {
		export: exportFormats,
		gap,
	});
	const jsonPath = `${outputBase}.json`;
	const storedHash = readStoredSourcesHash(outputBase);
	if (
		storedHash === sourcesHash &&
		bundleOutputsExist(outputBase, exportFormats)
	) {
		const spriteJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
		console.log(
			`bundle-sound: ${bundleName} unchanged (${sourcesHash.slice(0, 8)}…) → skip`,
		);
		return {
			name: bundleName,
			clips: sourceFiles.length,
			jsonPath,
			outDir,
			sprite: spriteJson,
			skipped: true,
		};
	}

	const { files, cleanup } = prepareSoundFilesForBundle(inputDir, sourceFiles);

	fs.mkdirSync(outDir, { recursive: true });

	let spriteJson;
	try {
		spriteJson = normalizeHowlerJsonPaths(
			await audiosprite(files, {
				output: outputBase,
				path: jsonResPath.replace(/\\/g, "/"),
				export: exportFormats,
				format: "howler2",
				gap,
				logger: {
					debug: () => {},
					info: (msg, meta) => {
						if (meta?.file) {
							console.log(
								`bundle-sound: ${msg} ${path.basename(String(meta.file))}`,
							);
						}
					},
					log: () => {},
				},
			}),
		);
	} finally {
		cleanup();
	}

	fs.writeFileSync(jsonPath, `${JSON.stringify(spriteJson, null, 2)}\n`);
	writeStoredSourcesHash(outputBase, sourcesHash);

	console.log(
		`bundle-sound: ${bundleName} ${sourceFiles.length} clips → ${path.relative(root, jsonPath)} (${exportFormats}, howler2)`,
	);

	return {
		name: bundleName,
		clips: sourceFiles.length,
		jsonPath,
		outDir,
		sprite: spriteJson,
	};
}

const isCli =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
	const one = process.argv[2];
	bundleSound(one ? { rawInputDir: one } : {}).catch((err) => {
		console.error(err.message ?? err);
		process.exit(1);
	});
}

// 2026-06-27, Composer: playbox sound bundle script [pbxs1]
// 2026-06-27, Composer: dev/res/sound → res/sound mirror [pbxs2]
// 2026-06-28, Composer: skip rebuild when source hash matches [pbxs3]
// 2026-06-28, Composer: bundle.txt crop start/stop seconds [pbxs4]
// 2026-06-28, Composer: source hash uses file size + bundle.txt content [pbxs5]
