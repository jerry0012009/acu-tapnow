import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const output = path.resolve("artifacts/private/acu-ui");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const canvasId = "00000000-0000-4000-8000-000000000001";
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
try {
  for (const edition of ["companion", "backup"]) {
    const context = await browser.newContext({ viewport: { width: edition === "companion" ? 560 : 380, height: 580 } });
    await context.addInitScript(({ edition, canvasId, version }) => {
      const sync = { enabled: true, llmEnabled: true, llmIncludeImages: true };
      const local = { companionTrialDefaultsVersion: 1 };
      globalThis.uiFixture = { sync, local, failSave: false, native: "error" };
      const storage = values => ({
        get: async keys => Array.isArray(keys) ? Object.fromEntries(keys.map(key => [key, values[key]])) : { ...keys, ...values },
        set: async value => { if (globalThis.uiFixture.failSave) throw Error("storage fixture failure"); Object.assign(values, value); },
        remove: async key => { delete values[key]; }
      });
      globalThis.chrome = {
        runtime: { id: "fixture", getManifest: () => ({ version }), getURL: file => new URL(file, location.origin).href,
          onMessage: { addListener() {} },
          sendNativeMessage: async (_host, message) => {
            if (globalThis.uiFixture.native === "error") throw Error("ACU Runtime 暂未授权");
            if (message.action === "ack") return { ok: true };
            return { ok: true, grant: "a".repeat(64), ...(edition === "companion" ? { config: { kind: "acu-tapnow-companion", schema: 1, apiKey: "fixture-not-a-real-key", settings: { llmBaseUrl: "https://acu.best/v1", llmProtocol: "responses", llmModel: "gpt-6.1-sol" } } } : {}) };
          },
          sendMessage: async message => {
            if (message.type === "tapnow:ensure-backup-bridge") return { ok: true, hasSession: true, title: "ACU 创意项目 · 品牌影片" };
            return { ok: true };
          }
        },
        storage: { sync: storage(sync), local: storage(local) },
        tabs: { query: async () => [{ id: 7, url: `https://app.tapnow.ai/canvas/${canvasId}`, title: "ACU 创意项目 · 品牌影片" }],
          get: async () => ({ id: 7, url: `https://app.tapnow.ai/canvas/${canvasId}`, title: "ACU 创意项目 · 品牌影片" }),
          getCurrent: async () => ({ id: 8 }), onUpdated: { addListener() {} }, onRemoved: { addListener() {} },
          sendMessage: async (_id, message) => {
            if (message.endpoint.includes("/nodes?")) return { ok: true, body: { data: { nodes: [{ id: "n", type: "text", data: { text: "品牌影片" } }], has_more: false, total: 1 } } };
            if (message.endpoint.includes("/connections?")) return { ok: true, body: { data: { connections: [], has_more: false, total: 0 } } };
            return { ok: true, body: { data: { canvas: { id: canvasId, name: "ACU 创意项目 · 品牌影片" } } } };
          }, create: async () => ({}) }
      };
    }, { edition, canvasId, version });
    await context.route("https://acu-ui.test/**", async route => {
      const url = new URL(route.request().url());
      const file = path.resolve(`.output/${edition}/chrome-mv3`, `.${url.pathname}`);
      try {
        await route.fulfill({ body: await fs.readFile(file), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" });
      } catch { await route.fulfill({ status: 404, body: "not found" }); }
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://acu-ui.test/popup.html");
    await page.getByText(/ACU Runtime 暂未授权/).waitFor();
    assert.equal(await page.locator("#runtime-status").getAttribute("data-state"), "error");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgb(17, 18, 20)");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (edition === "companion") {
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.equal(await page.locator("body").evaluate(node => node.getBoundingClientRect().width), 560, "Chrome action popup has an intrinsic usable width independent of the initial viewport");
      await page.setViewportSize({ width: 560, height: 580 });
      await page.getByRole("tab", { name: "API 配置", exact: true }).click();
      for (const label of ["接口协议", "模型", "API Base URL", "API Key"]) {
        const input = page.getByLabel(label, { exact: true });
        const box = await input.boundingBox();
        const footer = await page.locator(".popup-footer").boundingBox();
        assert(box && box.y > 0 && box.y + box.height <= footer.y, `${label} fully visible above save`);
      }
      await page.getByLabel("API Base URL", { exact: true }).fill("https://console.acucompute.com/v1");
      await page.getByLabel("API Key", { exact: true }).fill("fixture-popup-key");
      await page.getByRole("button", { name: "保存设置", exact: true }).click();
      await page.getByText("已保存。刷新 TapNow 页面后生效。", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => globalThis.uiFixture.local.apiKey), "fixture-popup-key");
      await page.getByLabel("API Key", { exact: true }).fill("");
      await page.screenshot({ path: path.join(output, "companion-api-popup.png") });
      const settingsPage = await context.newPage();
      await settingsPage.goto("https://acu-ui.test/popup.html?view=settings#api");
      assert.equal(await settingsPage.getByRole("tab", { name: "API 配置" }).getAttribute("aria-selected"), "true");
      for (const width of [1280, 390]) {
        await settingsPage.setViewportSize({ width, height: 800 });
        assert(await settingsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await settingsPage.getByLabel("API Key", { exact: true }).fill("fixture-settings-page");
        await settingsPage.screenshot({ path: path.join(output, `settings-page-${width}.png`), fullPage: true });
      }
      await settingsPage.close();
      await page.getByRole("tab", { name: "常用设置", exact: true }).click();
      assert.equal(await page.locator("#advanced-settings").getAttribute("open"), null);
      await page.getByLabel("模型审阅", { exact: true }).focus();
      await page.keyboard.press("Space");
      assert.equal(await page.getByLabel("模型审阅", { exact: true }).isChecked(), false);
      await page.keyboard.press("Space");
      assert.equal(await page.getByLabel("模型审阅", { exact: true }).isChecked(), true);
      await page.getByLabel("要求词", { exact: true }).fill("电影感, 品牌色");
      await page.getByRole("button", { name: "保存设置", exact: true }).click();
      await page.getByText("已保存。刷新 TapNow 页面后生效。", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => globalThis.uiFixture.sync.requiredTerms), ["电影感", "品牌色"]);
      await page.evaluate(() => { globalThis.uiFixture.failSave = true; });
      await page.getByRole("button", { name: "保存设置", exact: true }).click();
      await page.getByText("设置未完整保存，请重试。", { exact: true }).waitFor();
      assert.equal(await page.locator("#save").isEnabled(), true);
      await page.evaluate(() => { globalThis.uiFixture.failSave = false; });
      await page.screenshot({ path: path.join(output, "companion-popup.png"), fullPage: true });
      await page.getByRole("tab", { name: "API 配置", exact: true }).click();
      await page.getByText("模型与高级设置", { exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#advanced-settings").getAttribute("open"), "");
      await page.evaluate(() => { document.querySelector(".popup-content").scrollTop = 0; });
      await page.getByRole("button", { name: "保存设置", exact: true }).click();
      await page.getByText("已保存。刷新 TapNow 页面后生效。", { exact: true }).waitFor();
      await page.getByLabel("模型", { exact: true }).fill("gpt-6.1-sol");
      await page.screenshot({ path: path.join(output, "companion-advanced.png"), fullPage: true });
      const footer = await page.locator(".popup-footer").boundingBox();
      assert(footer.y + footer.height <= 601, "save action stays in popup viewport");
      await page.getByText("模型与高级设置", { exact: true }).click();
      await page.getByRole("tab", { name: "常用设置", exact: true }).click();
    }
    await page.evaluate(() => { globalThis.uiFixture.native = "ready"; });
    await page.getByRole("button", { name: "连接 ACU Runtime", exact: true }).click();
    await page.getByText(/^已连接。/).waitFor();
    assert.equal(await page.locator("#runtime-status").getAttribute("data-state"), "success");
    await page.evaluate(() => { document.querySelector(".popup-content").scrollTop = 0; });
    await page.screenshot({ path: path.join(output, `${edition}-connected.png`), fullPage: true });
    await page.goto("https://acu-ui.test/connect.html");
    await page.getByText(/请在 ACU Runtime 点击/).waitFor();
    await page.screenshot({ path: path.join(output, `${edition}-connect-retry.png`) });
    await page.evaluate(() => { globalThis.uiFixture.native = "ready"; });
    await page.getByRole("button", { name: "重新连接", exact: true }).click();
    await page.getByRole("link", { name: "打开 TapNow" }).waitFor();
    await page.screenshot({ path: path.join(output, `${edition}-connect-success.png`) });
    if (edition === "backup") {
      await page.goto("https://acu-ui.test/backup.html");
      await page.getByText("请从列表明确选择要备份的画布。", { exact: true }).waitFor();
      assert.equal(await page.locator("#scan").isDisabled(), true);
      await page.getByLabel("选择备份画布").selectOption("7");
      await page.getByText("来源画布已确认。", { exact: true }).waitFor();
      await page.getByRole("button", { name: "扫描此画布", exact: true }).click();
      await page.getByText("扫描完成，请选择保存目录。", { exact: true }).waitFor();
      assert.equal(await page.locator("#backup").isDisabled(), true, "no directory means no backup");
      for (const width of [1440, 920, 390]) {
        await page.setViewportSize({ width, height: 960 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `backup-center-${width}.png`), fullPage: true });
      }
      await page.goto("https://acu-ui.test/library.html");
      await page.getByRole("button", { name: "打开备份目录", exact: true }).waitFor();
      await page.evaluate(async () => {
        const files = {
          "report.json": JSON.stringify({ canvasId: "c", canvasName: "品牌影片 · 视觉参考与分镜", producer: "test-fixture", nodeCount: 3, connectionCount: 2, referenceCount: 1, uniqueAssetCount: 1, status: "completed", diagnostics: { nodes: { complete: true }, connections: { complete: true } } }),
          "canvas.json": '{"id":"c"}',
          "nodes.ndjson": [{ id: "n", type: "text", position: { x: 40, y: 60 }, data: { title: "创意方向", text: "保留品牌辨识度，以自然光与干净背景呈现产品。" } }, { id: "m", type: "image", position: { x: 400, y: 60 }, data: { title: "产品主画面", prompt: "黑色精密产品，橙色细节，工作室摄影。" } }, { id: "v", type: "video", position: { x: 760, y: 80 }, data: { title: "动态分镜" } }].map(JSON.stringify).join("\n"),
          "connections.ndjson": [{ id: "e", source: "n", target: "m" }, { id: "f", source: "m", target: "v" }].map(JSON.stringify).join("\n"),
          "references.ndjson": JSON.stringify({ referenceId: "r", nodeId: "m", assetId: "a", fieldPath: "data.src", role: "output" }),
          "assets.ndjson": JSON.stringify({ assetId: "a", status: "missing", reason: "测试快照未包含原始媒体" })
        };
        const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("ACU 视觉项目", { create: true });
        for (const [name, text] of Object.entries(files)) {
          const stream = await (await directory.getFileHandle(name, { create: true })).createWritable();
          await stream.write(text);
          await stream.close();
        }
        window.showDirectoryPicker = async () => directory;
      });
      await page.getByRole("button", { name: "打开备份目录", exact: true }).click();
      await page.locator("#inspector h2").waitFor();
      await page.getByText("本地快照已打开 · 文件尚未重新核对", { exact: true }).waitFor();
      for (const width of [1440, 920, 390]) {
        await page.setViewportSize({ width, height: 960 });
        await page.getByRole("button", { name: "适配当前视图" }).click();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const box = await page.locator("#graph canvas").first().boundingBox();
        assert(box.width > 200 && box.height > 200, "graph stays framed");
        await page.screenshot({ path: path.join(output, `library-${width}.png`), fullPage: true });
      }
      await page.getByRole("button", { name: "资产结果", exact: true }).click();
      await page.getByText("测试快照未包含原始媒体", { exact: true }).waitFor();
      await page.getByRole("button", { name: "关系画布", exact: true }).click();
      await page.locator("#inspector h2").waitFor();
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    const sync = { enabled: true, llmEnabled: true, llmIncludeImages: false, llmBaseUrl: "https://acu.best/v1" };
    const local = { companionTrialDefaultsVersion: 1, apiKey: "fixture-not-a-real-key" };
    const listeners = [];
    globalThis.recallFixture = "ready";
    globalThis.chrome = {
      runtime: { id: "fixture", onInstalled: { addListener() {} }, onMessage: { addListener: listener => listeners.push(listener) }, sendMessage: message => new Promise(resolve => {
        for (const listener of listeners) if (listener(message, {}, resolve)) return;
        resolve({ ok: false });
      }) },
      storage: Object.fromEntries([["sync", sync], ["local", local]].map(([key, values]) => [key, {
        get: async defaults => ({ ...defaults, ...values }), set: async value => Object.assign(values, value), remove: async key => { delete values[key]; }
      }]))
    };
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith("https://acu.best/v1/")) return nativeFetch(url, options);
      if (String(url).endsWith("/creative-assist")) return new Response(JSON.stringify(globalThis.recallFixture === "ready"
        ? { status: "ready", supplement: "保留品牌辨识度", references: ["材质表现", "品牌辨识", "灯光经验", "构图偏好", "交付习惯", "第六条不展示"].map((name, index) => ({ id: String(index), name, quote: `真实来源原文 ${index + 1}`, application: `本次应用原因 ${index + 1}`, scope: "personal" })) }
        : { status: "no_match", supplement: "", references: [] }), { headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ output_text: JSON.stringify({ decision: "allow", summary: "已结合当前输入审阅", issues: [], suggestions: [] }) }), { headers: { "Content-Type": "application/json" } });
    };
    localStorage.setItem("access_token", "fixture-only");
  });
  await context.route("https://app.tapnow.ai/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { code: 0, data: { canvas: {
      nodes: [{ id: "image-target", type: "image", data: { prompt: "品牌产品摄影，黑色机身与橙色细节，干净的工作室背景。" } }, { id: "text-source", type: "text", data: { text: "保留品牌辨识度，明确材质与光线。" } }],
      connections: [{ id: "e", source: "text-source", target: "image-target" }]
    } } } });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{background:#222426;color:#e8e8e8;font:14px system-ui;margin:0}main{padding:60px}.react-flow__node{padding:24px;border:1px solid #555;background:#292c30;width:380px;border-radius:8px}textarea{width:100%;height:100px;background:#1a1c1f;color:#eee;border:1px solid #666;padding:12px}</style><main><h1>品牌影片 · 画布</h1><div class="react-flow__node selected" data-id="image-target"><div data-testid="canvas-node-prompt-textarea"><textarea>品牌产品摄影，黑色机身与橙色细节，干净的工作室背景。</textarea></div></div><div class="react-flow__pane">产品主画面</div></main></html>' });
  });
  const panelPage = await context.newPage();
  panelPage.on("pageerror", error => errors.push(error.message));
  await panelPage.goto(`https://app.tapnow.ai/canvas/${canvasId}`);
  await panelPage.addScriptTag({ content: await fs.readFile(".output/companion/chrome-mv3/background.js", "utf8") });
  await panelPage.addScriptTag({ content: await fs.readFile(".output/companion/chrome-mv3/content-scripts/tapnow.js", "utf8") });
  const host = panelPage.locator("#tapnow-companion-host");
  await host.locator(".launcher").waitFor();
  await panelPage.locator("textarea").click();
  await host.locator(".launcher").click();
  await host.locator(".meta").waitFor();
  assert.equal(await host.locator(".panel").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(17, 18, 20)");
  await host.locator(".detect").click();
  await panelPage.waitForFunction(() => !document.querySelector("#tapnow-companion-host").shadowRoot.querySelector(".detect").disabled);
  await host.locator(".memory-evidence summary").waitFor();
  assert.equal(await host.locator(".memory-evidence").getAttribute("open"), null);
  await host.locator(".memory-evidence summary").click();
  assert.deepEqual(await host.locator(".memory-evidence li strong").allTextContents(), ["材质表现", "品牌辨识", "灯光经验", "构图偏好", "交付习惯"]);
  assert.equal(await host.getByText("第六条不展示", { exact: true }).count(), 0);
  for (const width of [1440, 920, 390]) {
    await panelPage.setViewportSize({ width, height: 960 });
    const box = await host.locator(".panel").boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width, "panel stays within canvas viewport");
    assert(await host.locator(".detect svg").isVisible());
    await panelPage.screenshot({ path: path.join(output, `companion-panel-${width}.png`) });
  }
  await panelPage.evaluate(() => { globalThis.recallFixture = "no_match"; });
  await host.locator(".detect").click();
  await panelPage.waitForFunction(() => !document.querySelector("#tapnow-companion-host").shadowRoot.querySelector(".detect").disabled);
  assert.equal(await host.locator(".memory-evidence").count(), 0, "no-match recall stays out of normal UI");
  const recallDebug = JSON.parse(await host.locator(".debug pre").textContent());
  assert.equal(recallDebug.creativeMemory.status, "no_match", JSON.stringify(recallDebug));
  await host.getByRole("button", { name: "关闭", exact: true }).first().click();
  assert.equal(await host.locator(".panel").isVisible(), false);
  await context.close();
  assert.deepEqual(errors, []);
  console.log(`PASS: keyboard switches/disclosures, settings/save/error/connection states, backup scan guards, responsive backup, graph library and injected companion panel. Screenshots: ${output}`);
} finally { await browser.close(); }
