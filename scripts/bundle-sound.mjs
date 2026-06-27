// Bundle dev/res/sound → res/sound audiosprite + Howler v2 JSON
// 2026-06-27, Composer: playbox sound bundle script [pbxs1]
// Requires: npm install audiosprite ffmpeg-static (devDependencies)

import { execFileSync } from "node:child_process";
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
 * @brief Optional per-clip volume boosts from bundle.txt in a sound folder.
 * Lines: `<audio-basename> boost=<number>` (e.g. `lowFrequency_explosion_001 boost=2.0`).
 * @param {string} inputDir
 * @returns {Map<string, number>}
 */
export function readBundleTxtBoosts(inputDir) {
	const boosts = new Map();
	const file = path.join(inputDir, BUNDLE_TXT_NAME);
	if (!fs.existsSync(file)) {
		return boosts;
	}
	const text = fs.readFileSync(file, "utf8");
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const m = trimmed.match(/^(\S+)\s+boost=([0-9.]+)\s*$/i);
		if (!m) {
			console.warn(
				`bundle-sound: skip bundle.txt line in ${path.relative(ROOT, inputDir)}: ${trimmed}`,
			);
			continue;
		}
		boosts.set(m[1], Number(m[2]));
	}
	return boosts;
}

/**
 * @brief Resolve volume boost from bundle.txt keyed by audio basename.
 * @param {Map<string, number>} bundleBoosts
 * @param {string} fileBase audio basename without extension
 * @returns {number}
 */
export function resolveSoundBoost(bundleBoosts, fileBase) {
	return bundleBoosts.get(fileBase) ?? DEFAULT_SOUND_BOOST;
}

/**
 * @brief Apply linear volume boost to one clip via ffmpeg (returns input when boost is 1).
 * @param {string} inputPath
 * @param {number} boost
 * @param {string} tempDir
 * @returns {string}
 */
export function preprocessSoundVolume(inputPath, boost, tempDir) {
	const n = Number(boost);
	if (!Number.isFinite(n) || n === DEFAULT_SOUND_BOOST) {
		return inputPath;
	}
	const outPath = path.join(tempDir, `${audioBaseName(inputPath)}.wav`);
	execFileSync(
		resolveFfmpegPath(),
		[
			"-y",
			"-i",
			inputPath,
			"-filter:a",
			`volume=${n}`,
			"-ar",
			"44100",
			"-ac",
			"1",
			outPath,
		],
		{ stdio: "pipe" },
	);
	return outPath;
}

/**
 * @brief Map source clips to boosted temp copies when bundle.txt requests it.
 * @param {string} inputDir
 * @param {string[]} files absolute paths sorted like listBundleSoundFiles
 * @returns {{ files: string[], cleanup: () => void }}
 */
export function prepareSoundFilesForBundle(inputDir, files) {
	const bundleBoosts = readBundleTxtBoosts(inputDir);
	let tempDir = null;
	const prepared = files.map((file) => {
		const boost = resolveSoundBoost(bundleBoosts, audioBaseName(file));
		if (boost === DEFAULT_SOUND_BOOST) {
			return file;
		}
		if (!tempDir) {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-sound-"));
		}
		const out = preprocessSoundVolume(file, boost, tempDir);
		console.log(
			`bundle-sound: boost ${audioBaseName(file)} x${boost} → ${path.basename(out)}`,
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
 * @returns {Promise<{ name: string, clips: number, jsonPath: string, outDir: string, sprite: object }>}
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

	const { files, cleanup } = prepareSoundFilesForBundle(inputDir, sourceFiles);

	fs.mkdirSync(outDir, { recursive: true });

	const exportFormats = opts.export ?? DEFAULT_SOUND_EXPORT;
	let spriteJson;
	try {
		spriteJson = normalizeHowlerJsonPaths(
			await audiosprite(files, {
				output: outputBase,
				path: jsonResPath.replace(/\\/g, "/"),
				export: exportFormats,
				format: "howler2",
				gap: opts.gap ?? 1,
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

	const jsonPath = `${outputBase}.json`;
	fs.writeFileSync(jsonPath, `${JSON.stringify(spriteJson, null, 2)}\n`);

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
