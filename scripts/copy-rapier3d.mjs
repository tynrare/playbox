// Copy vendored rapier3d pkg (js, d.ts, wasm, maps, ts sources for sourcemaps).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = process.env.RAPIER_PKG
	?? path.resolve(root, "../libs/rapier.js/builds/rapier3d/pkg");
const dst = path.join(root, "src/lib/rapier3d");

const include = /\.(js|d\.ts|wasm|map|ts)$/;

function copyDir(srcDir, dstDir) {
	for (const name of fs.readdirSync(srcDir, { withFileTypes: true })) {
		const src = path.join(srcDir, name.name);
		const out = path.join(dstDir, name.name);
		if (name.isDirectory()) {
			fs.mkdirSync(out, { recursive: true });
			copyDir(src, out);
			continue;
		}
		if (!include.test(name.name)) {
			continue;
		}
		fs.copyFileSync(src, out);
	}
}

if (!fs.existsSync(pkg)) {
	console.error(`copy-rapier3d: pkg not found: ${pkg}`);
	process.exit(1);
}

fs.mkdirSync(dst, { recursive: true });
copyDir(pkg, dst);
console.log(`copy-rapier3d: ${pkg} → ${dst}`);
