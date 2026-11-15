import { normalizeAcuEndpoint } from "./acu-endpoint";

export interface RuntimeConfig {
  kind: "acu-tapnow-companion";
  schema: 1;
  apiKey: string;
  settings: {
    llmBaseUrl: string;
    llmProtocol: "responses" | "chat_completions";
    llmModel: string;
  };
}

export function parseRuntimeConfig(text: string): RuntimeConfig {
  if (text.length > 16_384) throw new Error("接入配置文件过大");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("无法读取接入配置"); }
  if (!value || typeof value !== "object") throw new Error("接入配置格式无效");
  const input = value as Record<string, unknown>;
  const settings = input.settings as Record<string, unknown> | null;
  if (input.kind !== "acu-tapnow-companion" || input.schema !== 1 ||
      typeof input.apiKey !== "string" || !/^\S{8,4096}$/.test(input.apiKey) ||
      !settings || typeof settings !== "object" ||
      typeof settings.llmBaseUrl !== "string" ||
      !["responses", "chat_completions"].includes(String(settings.llmProtocol)) ||
      typeof settings.llmModel !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(settings.llmModel)) {
    throw new Error("接入配置版本、ACU 地址、Key 或模型无效");
  }
  let base: string;
  try { base = normalizeAcuEndpoint(String(settings.llmBaseUrl)); }
  catch { throw new Error("接入配置版本、ACU 地址、Key 或模型无效"); }
  // Pick only supported fields, never merge arbitrary imported settings.
  return {
    kind: "acu-tapnow-companion", schema: 1, apiKey: input.apiKey,
    settings: {
      llmBaseUrl: base,
      llmProtocol: settings.llmProtocol as RuntimeConfig["settings"]["llmProtocol"],
      llmModel: settings.llmModel
    }
  };
}
