// Purpose: copy @dimforge/rapier3d-compat into src/lib for vendored local import.
// 2026-06-29, Composer: Rapier3d vendor script [rpvnd1]
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgRoot = join(root, "node_modules", "@dimforge", "rapier3d-compat");
const pkgJson = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
const version = pkgJson.version;
const header = `// Vendored from @dimforge/rapier3d-compat@${version} — run npm run rapier:vendor to refresh.\n// 2026-06-29, Composer: Rapier3d vendor script [rpvnd1]\n`;

const srcMjs = join(pkgRoot, "rapier.es.js");
const srcDts = join(pkgRoot, "rapier.d.ts");
const dstJs = join(root, "src", "lib", "Rapier3d.js");
const dstDts = join(root, "src", "lib", "Rapier3d.d.ts");

const mjsBody = readFileSync(srcMjs, "utf8");
writeFileSync(dstJs, header + mjsBody);
copyFileSync(srcDts, dstDts);

console.log(`Vendored rapier3d-compat@${version} → src/lib/Rapier3d.js`);
