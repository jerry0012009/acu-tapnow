import { browser } from "wxt/browser";
import { loadCompanionSettings } from "../../utils/companion-settings";
import { parseRuntimeConfig, type RuntimeConfig } from "../../utils/runtime-config";
import { bindRuntimePopup } from "../../utils/runtime-popup";
import { createIcons, SlidersHorizontal, ShieldCheck, Link2, Save } from "lucide";
import "../../viewer/acu-theme.css";
import "../../utils/acu-popup.css";
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
  <header class="popup-header"><div class="acu-brand"><span class="acu-mark" aria-hidden="true">A</span><div><span class="acu-wordmark">ACU <span class="acu-edition">TapNow · 副驾驶</span></span></div></div><span class="acu-version">v${browser.runtime.getManifest().version}</span></header>
  <main class="popup-content">
  <section class="popup-section" aria-label="审阅设置">
    <h1 class="section-heading"><i data-lucide="sliders-horizontal" aria-hidden="true"></i>审阅设置</h1>
    <label class="toggle-row" for="enabled"><span>启用副驾驶<small>画布内节点检测入口</small></span><input id="enabled" type="checkbox"></label>
    <label class="toggle-row" for="llmEnabled"><span>模型审阅</span><input id="llmEnabled" type="checkbox"></label>
    <label class="toggle-row" for="llmIncludeImages"><span>图片与视频采样画面<small>检测时随节点内容发送</small></span><input id="llmIncludeImages" type="checkbox"></label>
  </section>
  <section class="popup-section" aria-label="ACU Runtime">
    <div class="runtime-row"><div><strong>ACU Runtime</strong><small>本机连接</small></div><button id="runtime-connect" type="button" aria-label="连接 ACU Runtime"><i data-lucide="link-2" aria-hidden="true"></i>连接</button></div>
    <p id="runtime-status" class="acu-status" role="status"></p>
  </section>
  <section class="popup-section" aria-label="团队规则"><h2 class="section-heading"><i data-lucide="shield-check" aria-hidden="true"></i>团队规则</h2>
    <label class="field-label" for="requiredTerms">要求词</label>
    <textarea id="requiredTerms" placeholder="例如：电影感, 品牌色"></textarea>
    <label class="field-label" for="forbiddenTerms">禁用词</label>
    <textarea id="forbiddenTerms" placeholder="例如：未授权品牌"></textarea>
    <p class="hint">多个词用逗号或换行分隔。</p>
  </section>
  <section class="popup-section"><details id="advanced-settings"><summary>模型与高级设置</summary>
    <label class="field-label" for="llmPrompt">审阅提示词</label>
    <textarea id="llmPrompt" maxlength="${MAX_LLM_PROMPT_LENGTH}" placeholder="用于指导模型审阅当前节点，只输出 JSON 结果。"></textarea>
    <p class="hint">最多 ${MAX_LLM_PROMPT_LENGTH.toLocaleString()} 字符 · 节点文字预算 ${MAX_REVIEW_TEXT_CHARS.toLocaleString()} 字符 · 请求体 ${(MAX_REVIEW_REQUEST_BYTES / 1_000_000).toFixed(0)} MB。</p>
    <label class="field-label" for="llmProtocol">接口协议</label>
    <select id="llmProtocol"><option value="responses">Responses</option><option value="chat_completions">Chat Completions</option></select>
    <label class="field-label" for="llmModel">模型</label>
    <input id="llmModel" type="text" placeholder="gpt-6.1-sol">
    <label class="field-label" for="llmBaseUrl">API Base URL</label>
    <input id="llmBaseUrl" type="text" placeholder="https://api.acucompute.com/v1">
    <label class="field-label" for="apiKey">API Key</label>
    <input id="apiKey" type="password" placeholder="留空表示不修改已保存的 Key" autocomplete="off">
    <p class="hint">Key 仅存于本机，不同步到 Chrome 账号。检测使用当前 ACU Key，图片、视频与音频分析可能产生费用。</p>
    <details class="import-settings"><summary>手动导入配置</summary>
    <label class="field-label" for="runtime-config">ACU Runtime 接入配置</label>
    <input id="runtime-config" type="file" accept=".json,application/json">
    <p id="runtime-preview" class="acu-status" role="status"></p>
    <button id="runtime-import" type="button" disabled>确认替换模型与 Key</button>
    <div class="hint">Key 仅保存在本机。检测会发送节点文字与勾选的图片，可能产生费用；导入后请删除配置文件。</div>
    </details></details></section>
    <p class="hint" style="margin-bottom:16px">检测会发送节点内容，并可能使用 ACU 余额。</p>
  </main>
  <footer class="popup-footer"><button id="save" class="primary" type="button"><i data-lucide="save" aria-hidden="true"></i>保存设置</button><div id="status" class="acu-status" role="status"></div></footer>
`;
createIcons({ icons: { SlidersHorizontal, ShieldCheck, Link2, Save } });

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
  const saveButton = $<HTMLButtonElement>("save");
  saveButton.disabled = true;
  $("status").dataset.state = "busy";
  $("status").textContent = "正在保存…";
  try {
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
    $("status").dataset.state = "success";
    $("status").textContent = "已保存。刷新 TapNow 页面后生效。";
  } catch {
    $("status").dataset.state = "error";
    $("status").textContent = "设置未完整保存，请重试。";
  } finally { saveButton.disabled = false; }
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
