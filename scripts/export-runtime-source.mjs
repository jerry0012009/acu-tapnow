import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/export-runtime-source.mjs EMPTY_DIRECTORY");
const target = path.resolve(destination);
if (target === process.cwd() || target.startsWith(process.cwd() + path.sep)) throw new Error("Export outside source repository");
if (existsSync(target) && readdirSync(target).length) throw new Error("Destination must be empty");
mkdirSync(target, { recursive: true });
// Explicit allowlist: no Git history, example canvases, credentials or old ZIPs.
for (const name of [".gitignore", "package.json", "package-lock.json", "wxt.config.ts", "extension-identities.json", "tsconfig.backup.json", "entrypoints", "editions", "utils", "viewer", "test", "scripts", "distribution"]) {
  cpSync(name, path.join(target, name), { recursive: true });
}
mkdirSync(path.join(target, "docs"));
cpSync("docs/RUNTIME_AGENT.md", path.join(target, "README.md"));
cpSync("docs/RUNTIME_AGENT.md", path.join(target, "docs/RUNTIME_AGENT.md"));
mkdirSync(path.join(target, ".github/workflows"), { recursive: true });
cpSync("distribution/runtime-release.yml", path.join(target, ".github/workflows/release.yml"));
console.log(`Exported selected source to ${target}; no release catalog is activated automatically.`);
