import { defineConfig } from "wxt";
import path from "node:path";
import fs from "node:fs";

const edition = process.env.TAPNOW_EDITION || "backup";
if (!["backup", "companion"].includes(edition)) throw new Error("Unknown TAPNOW_EDITION");
const backup = edition === "backup";
const identity = JSON.parse(fs.readFileSync("extension-identities.json", "utf8"))[edition];
const trialKeyFile = process.env.TAPNOW_TRIAL_KEY_FILE;
const trialKey = !backup && trialKeyFile
  ? String(JSON.parse(fs.readFileSync(trialKeyFile, "utf8")).apiKey || "").trim()
  : "";
export default defineConfig({
  vite: () => ({ define: { __TAPNOW_TRIAL_API_KEY__: JSON.stringify(trialKey), __TAPNOW_EDITION__: JSON.stringify(edition) } }),
  outDir: `.output/${edition}`,
  filterEntrypoints: backup ? ["background", "popup", "backup", "library", "backup-bridge", "backup-launcher", "connect"] : ["background", "popup", "tapnow", "connect"],
  hooks: {
    "entrypoints:found"(_wxt, entries) {
      if (!backup) return;
      for (const entry of entries) {
        if (entry.name === "background") entry.inputPath = path.resolve("editions/backup/background.ts");
        if (entry.name === "popup") entry.inputPath = path.resolve("editions/backup/popup/index.html");
      }
    }
  },
  manifest: {
    key: identity.key,
    name: backup ? "TapNow Backup - 资产备份与本地画布" : "TapNow Companion - 副驾驶",
    version: "0.1.26",
    description: backup ? "Back up TapNow canvases, browse local assets and verify file integrity." : "Review focused TapNow nodes, prompts and references.",
    permissions: backup ? ["storage", "tabs", "scripting", "declarativeNetRequestWithHostAccess", "nativeMessaging"] : ["storage", "nativeMessaging"],
    host_permissions: [
      "https://app.tapnow.ai/*",
      "https://files.tapnow.media/*",
      "https://files.tapnow.top/*",
      ...(!backup ? ["https://api.openai.com/*", "https://*.acucompute.com/*", "https://*.acu.best/*"] : [])
    ],
    action: {
      default_title: backup ? "TapNow 资产备份" : "TapNow 副驾驶"
    }
  }
});
