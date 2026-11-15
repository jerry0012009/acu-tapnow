import { browser } from "wxt/browser";
import { loadCompanionSettings } from "../../utils/companion-settings";
import { parseRuntimeConfig, type RuntimeConfig } from "../../utils/runtime-config";
import { bindRuntimePopup } from "../../utils/runtime-popup";
import {
  normalizeSettings,
  type ReviewSettings
} from "../../utils/reviewer";
import {
  MAX_LLM_PROMPT_LENGTH,
  MAX_REVIEW_REQUEST_BYTES,
  MAX_REVIEW_TEXT_CHARS
} from "../../utils/limits";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, sans-serif; }
    body { width: 330px; margin: 0; padding: 16px; color: #0f172a; background: #f8fafc; }
    h1 { margin: 0 0 4px; font-size: 17px; }
    p { margin: 0 0 14px; color: #64748b; font-size: 12px; line-height: 1.4; }
    label { display: block; margin: 12px 0 6px; font-size: 12px; font-weight: 700; color: #475569; }
    input[type="text"], input[type="password"], textarea, select { box-sizing: border-box; width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; font: 13px/1.4 system-ui, sans-serif; }
    textarea { min-height: 52px; resize: vertical; }
    .row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .row label { margin: 0; font-weight: 600; color: #0f172a; }
    button { width: 100%; margin-top: 14px; min-height: 36px; border: 0; border-radius: 6px; background: #2563eb; color: white; font: 600 13px system-ui, sans-serif; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    input[type="file"] { max-width: 100%; font-size: 12px; }
    .section { border-top: 1px solid #e2e8f0; margin-top: 15px; padding-top: 3px; }
    .hint { color: #64748b; font-size: 11px; line-height: 1.4; margin-top: 5px; }
    #status { min-height: 18px; margin-top: 8px; color: #15803d; font-size: 12px; }
  </style>
  <h1>TapNow Companion 0.1</h1>
  <p>TapNow 节点审阅</p>
  <div class="row"><input id="enabled" type="checkbox"><label for="enabled">启用副驾驶</label></div>
  <div class="row"><input id="llmEnabled" type="checkbox"><label for="llmEnabled">启用模型审阅</label></div>
  <div class="row"><input id="llmIncludeImages" type="checkbox"><label for="llmIncludeImages">检测时发送图片与视频采样画面</label></div>
  <div class="section">
    <button id="runtime-connect" type="button">连接 ACU Runtime</button>
    <p id="runtime-status" role="status"></p>
    <details><summary>手动导入配置</summary>
    <label for="runtime-config">ACU Runtime 接入配置</label>
    <input id="runtime-config" type="file" accept=".json,application/json">
    <p id="runtime-preview" role="status"></p>
    <button id="runtime-import" type="button" disabled>确认替换模型与 Key</button>
    <div class="hint">Key 仅保存在本机。检测会发送节点文字与勾选的图片，可能产生费用；导入后请删除配置文件。</div>
    </details>
  </div>
  <label for="requiredTerms">团队要求词（逗号或换行分隔）</label>
  <textarea id="requiredTerms" placeholder="例如：电影感, 品牌色"></textarea>
  <label for="forbiddenTerms">团队禁用词（逗号或换行分隔）</label>
  <textarea id="forbiddenTerms" placeholder="例如：未授权品牌"></textarea>
    <div class="section">
    <label for="llmPrompt">LLM 审阅提示词</label>
    <textarea id="llmPrompt" maxlength="${MAX_LLM_PROMPT_LENGTH}" placeholder="用于指导模型审阅当前节点，只输出 JSON 结果。"></textarea>
    <div class="hint">检测时作为 system/instructions 发送，最多 ${MAX_LLM_PROMPT_LENGTH.toLocaleString()} 字符。</div>
    <div class="hint">节点文字总预算 ${MAX_REVIEW_TEXT_CHARS.toLocaleString()} 字符，请求体预算 ${(MAX_REVIEW_REQUEST_BYTES / 1_000_000).toFixed(0)} MB。</div>
    <label for="llmProtocol">接口协议</label>
    <select id="llmProtocol">
      <option value="responses">Responses</option>
      <option value="chat_completions">Chat Completions</option>
    </select>
    <label for="llmModel">模型</label>
    <input id="llmModel" type="text" placeholder="gpt-6.1-sol">
    <label for="llmBaseUrl">API Base URL</label>
    <input id="llmBaseUrl" type="text" placeholder="https://api.acucompute.com/v1">
    <label for="apiKey">API Key</label>
    <input id="apiKey" type="password" placeholder="留空表示不修改已保存的 Key">
    <div class="hint">检测使用当前 ACU Key，视频可包含画面与音频分析，可能产生费用。Key 不会同步到 Chrome 账号。</div>
  </div>
  <button id="save" type="button">保存设置</button>
  <div id="status" role="status"></div>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const { settings, apiKey: configuredKey } = await loadCompanionSettings(browser.storage);

($("enabled") as HTMLInputElement).checked = settings.enabled;
($("llmEnabled") as HTMLInputElement).checked = settings.llmEnabled;
($("llmIncludeImages") as HTMLInputElement).checked = settings.llmIncludeImages;
($("llmPrompt") as HTMLTextAreaElement).value = settings.llmPrompt;
($("llmProtocol") as HTMLSelectElement).value = settings.llmProtocol;
($("llmModel") as HTMLInputElement).value = settings.llmModel;
($("llmBaseUrl") as HTMLInputElement).value = settings.llmBaseUrl;
($("requiredTerms") as HTMLTextAreaElement).value = settings.requiredTerms.join(", ");
($("forbiddenTerms") as HTMLTextAreaElement).value = settings.forbiddenTerms.join(", ");
($("apiKey") as HTMLInputElement).placeholder = configuredKey
  ? "已配置，留空表示不修改"
  : "sk-...";

$("save").addEventListener("click", async () => {
  const next: ReviewSettings = normalizeSettings({
    enabled: ($("enabled") as HTMLInputElement).checked,
    llmEnabled: ($("llmEnabled") as HTMLInputElement).checked,
    llmIncludeImages: ($("llmIncludeImages") as HTMLInputElement).checked,
    llmPrompt: ($("llmPrompt") as HTMLTextAreaElement).value,
    llmProtocol: ($("llmProtocol") as HTMLSelectElement).value as ReviewSettings["llmProtocol"],
    llmModel: ($("llmModel") as HTMLInputElement).value,
    llmBaseUrl: ($("llmBaseUrl") as HTMLInputElement).value,
    requiredTerms: ($("requiredTerms") as HTMLTextAreaElement).value.split(/[,\n]/),
    forbiddenTerms: ($("forbiddenTerms") as HTMLTextAreaElement).value.split(/[,\n]/)
  });
  const apiKey = ($("apiKey") as HTMLInputElement).value.trim();
  await browser.storage.sync.set(next);
  await browser.storage.local.set({ runtimeConnection: null, ...(apiKey ? { apiKey } : {}) });
  $("status").textContent = "已保存。刷新 TapNow 页面后生效。";
});
bindRuntimePopup($<HTMLButtonElement>("runtime-connect"), $("runtime-status"), "companion", browser.runtime, browser.storage.local, async () => {
  const {settings} = await loadCompanionSettings(browser.storage);
  for (const id of ["llmBaseUrl", "llmModel", "llmProtocol"] as const) {
    $<HTMLInputElement | HTMLSelectElement>(id).value = settings[id];
  }
  $<HTMLInputElement>("llmEnabled").checked = settings.llmEnabled;
  $<HTMLInputElement>("apiKey").value = "";
  $<HTMLInputElement>("apiKey").placeholder = "已配置，留空表示不修改";
});

let pendingConfig: RuntimeConfig | null = null;
let importGeneration = 0;
let importing = false;
$("runtime-config").addEventListener("change", async () => {
  const generation = ++importGeneration;
  pendingConfig = null;
  $<HTMLButtonElement>("runtime-import").disabled = true;
  const file = $<HTMLInputElement>("runtime-config").files?.[0];
  if (!file) return;
  try {
    if (file.size > 16_384) throw new Error("接入配置文件过大");
    const config = parseRuntimeConfig(await file.text());
    if (generation !== importGeneration) return;
    pendingConfig = config;
    $("runtime-preview").textContent = `${config.settings.llmBaseUrl} · ${config.settings.llmModel} · ${config.settings.llmProtocol}。确认后替换当前模型与 Key，保留团队规则。`;
    $<HTMLButtonElement>("runtime-import").disabled = false;
  } catch (error) {
    if (generation !== importGeneration) return;
    $("runtime-preview").textContent = error instanceof Error ? error.message : "无法读取接入配置";
  }
});
$("runtime-import").addEventListener("click", async () => {
  if (!pendingConfig || importing) return;
  const config = pendingConfig;
  importing = true;
  $<HTMLInputElement>("runtime-config").disabled = true;
  $<HTMLButtonElement>("save").disabled = true;
  $<HTMLButtonElement>("runtime-import").disabled = true;
  try {
    await browser.storage.local.set({ apiKey: config.apiKey, companionTrialDefaultsVersion: 1, runtimeConnection: null });
    await browser.storage.sync.set({ ...config.settings, llmEnabled: true,
      llmIncludeImages: $<HTMLInputElement>("llmIncludeImages").checked });
    for (const id of ["llmBaseUrl", "llmModel", "llmProtocol"] as const) {
      $<HTMLInputElement | HTMLSelectElement>(id).value = config.settings[id];
    }
    $<HTMLInputElement>("llmEnabled").checked = true;
    $<HTMLInputElement>("apiKey").value = "";
    $<HTMLInputElement>("apiKey").placeholder = "已配置，留空表示不修改";
    $("runtime-preview").textContent = "已导入配置；尚未发送检测请求。请删除配置文件。";
    pendingConfig = null;
    $<HTMLInputElement>("runtime-config").value = "";
  } catch {
    $("runtime-preview").textContent = "配置未完整保存，请重试。";
    $<HTMLButtonElement>("runtime-import").disabled = false;
  } finally {
    importing = false;
    $<HTMLInputElement>("runtime-config").disabled = false;
    $<HTMLButtonElement>("save").disabled = false;
  }
});
