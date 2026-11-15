import { DEFAULT_SETTINGS, normalizeSettings, type ReviewSettings } from "./reviewer";
import { parseRuntimeConfig } from "./runtime-config";

declare const __TAPNOW_TRIAL_API_KEY__: string;

const TRIAL_DEFAULTS_VERSION = 1;
const bundledTrialKey = typeof __TAPNOW_TRIAL_API_KEY__ === "string"
  ? __TAPNOW_TRIAL_API_KEY__
  : "";

interface SettingsStorage {
  sync: {
    get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
  };
  local: {
    get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
  };
}

export async function loadCompanionSettings(
  storage: SettingsStorage,
  trialKey = bundledTrialKey
): Promise<{ settings: ReviewSettings; apiKey: string }> {
  const [saved, local] = await Promise.all([
    storage.sync.get({ ...DEFAULT_SETTINGS }),
    storage.local.get({ apiKey: "", companionTrialDefaultsVersion: 0, runtimeConnection: null })
  ]);
  if (local.companionTrialDefaultsVersion !== TRIAL_DEFAULTS_VERSION) {
    const update = {
      llmEnabled: true,
      llmIncludeImages: true,
      llmModel: !saved.llmModel || saved.llmModel === "gpt-5.6-luna"
        ? DEFAULT_SETTINGS.llmModel
        : saved.llmModel
    };
    Object.assign(saved, update);
    await storage.sync.set(update);
    // Only local storage receives the trial key. Never replace a user's key.
    if (!local.apiKey && trialKey) local.apiKey = trialKey;
    await storage.local.set({
      companionTrialDefaultsVersion: TRIAL_DEFAULTS_VERSION,
      ...(local.apiKey ? { apiKey: local.apiKey } : {})
    });
  }
  const managed = local.runtimeConnection as { settings?: unknown } | null;
  if (managed) {
    // Model, endpoint and key are committed together in local storage. Team
    // rules/image choices continue to use the user's existing settings.
    try {
      const config = parseRuntimeConfig(JSON.stringify({ kind: "acu-tapnow-companion", schema: 1,
        apiKey: local.apiKey, settings: managed.settings }));
      return { settings: normalizeSettings({ ...saved, ...config.settings, llmEnabled: true }), apiKey: config.apiKey };
    } catch { throw new Error("ACU 接入配置无效，请在 Runtime 重新接入"); }
  }
  return { settings: normalizeSettings(saved), apiKey: String(local.apiKey || "") };
}
