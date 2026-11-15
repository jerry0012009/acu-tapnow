import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Run only after zip builds without a bundled trial key. Only source and these
// two verified outputs belong in the separate acu-tapnow distribution repository.
if (process.env.TAPNOW_TRIAL_KEY_FILE) throw new Error("Runtime channel must not contain a trial key");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid version");
const packages = Object.fromEntries(["companion", "backup"].map(edition => {
  const name = `tapnow-${edition}-${version}-chrome.zip`;
  const body = readFileSync(`releases/${name}`);
  return [edition, { version, url: `https://github.com/jerry0012009/acu-tapnow/releases/download/v${version}/${name}`,
    sha256: createHash("sha256").update(body).digest("hex"), size: body.length }];
}));
writeFileSync("runtime-channel.json", JSON.stringify({ schema: 1, packages }, null, 2) + "\n");
