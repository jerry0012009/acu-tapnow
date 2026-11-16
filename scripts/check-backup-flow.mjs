import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const output = path.resolve("artifacts/private/backup-flow");
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, "profile-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(profile, "key.pem"), "-out", path.join(profile, "cert.pem"), "-days", "1", "-subj", "/CN=files.tapnow.media"], { stdio: "ignore" });
const media = Buffer.from("isolated-original-media-bytes");
const mediaHeaders = [];
let recoverMissing = false;
const mediaServer = https.createServer({ key: await fs.readFile(path.join(profile, "key.pem")), cert: await fs.readFile(path.join(profile, "cert.pem")) }, (req, res) => {
  mediaHeaders.push(req.headers);
  if (req.url.endsWith("missing") && !recoverMissing) { res.writeHead(404); return res.end("missing"); }
  res.writeHead(206, { "content-type": "image/png", "content-range": `bytes 0-${media.length - 1}/${media.length}`, "content-length": media.length, etag: '"fixture-original"' });
  res.end(media);
});
await new Promise(resolve => mediaServer.listen(0, "127.0.0.1", resolve));
const mediaOrigin = `https://files.tapnow.media:${mediaServer.address().port}`;
const extension = path.resolve(process.env.TAPNOW_TEST_EXTENSION || ".output/backup/chrome-mv3");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1440, height: 960 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-sandbox", "--ignore-certificate-errors", "--no-proxy-server", "--host-resolver-rules=MAP files.tapnow.media 127.0.0.1"]
});
const canvas = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const next = "00000000-0000-4000-8000-000000000003";
const expectedHash = createHash("sha256").update(media).digest("hex");
const requests = [], errors = [];
const origin = "https://app.tapnow.ai";
try {
  await context.route("https://**/*", async route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    if (url.hostname === "files.tapnow.media") {
      return route.continue();
    }
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>品牌影片 · 新版画布</title><style>body{background:#191b1e;color:#eee;font:14px system-ui;margin:0;padding:48px}.canvas{height:700px;border:1px solid #444;padding:24px}</style><h1>品牌影片</h1><div class="canvas" data-canvas-instance="fixture" data-canvas-active="true">新版 GPU 画布</div></html>' });
    if (url.pathname.endsWith("/nodes")) {
      const cursor = url.searchParams.get("cursor");
      return route.fulfill({ json: { code: 0, data: { nodes: cursor ? [
        { id: "n-offscreen", type: "image", data: { title: "屏外素材", history: [{ src: `${mediaOrigin}/original` }], options: [`${mediaOrigin}/missing`] } }
      ] : [{ id: "n-visible", type: "image", data: { title: "产品主画面", src: `${mediaOrigin}/original`, prompt: "保留品牌材质" } }], has_more: !cursor, next_cursor: cursor ? "" : "page-two", total: 2 } } });
    }
    if (url.pathname.endsWith("/connections")) return route.fulfill({ json: { code: 0, data: { connections: [{ id: "e", source: "n-visible", target: "n-offscreen" }], has_more: false, total: 1 } } });
    return route.fulfill({ json: { code: 0, data: { id: canvas, name: "品牌影片 · 新版画布", preview_image: `${mediaOrigin}/original` } } });
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`;
  for (const page of context.pages()) if (page.url().startsWith(extensionOrigin)) await page.close();
  const source = await context.newPage();
  source.on("pageerror", error => errors.push(error.message));
  await source.goto(`${origin}/p/${project}?c=${canvas}`);
  await source.evaluate(() => localStorage.setItem("access_token", "isolated-backup-fixture"));
  const launcher = source.locator("#tapnow-backup-host");
  await launcher.getByRole("button", { name: "备份此画布", exact: true }).waitFor();
  const opened = context.waitForEvent("page");
  await launcher.getByRole("button", { name: "备份此画布", exact: true }).click();
  const page = await opened;
  await page.waitForURL(`${extensionOrigin}/backup.html*`);
  page.on("pageerror", error => errors.push(error.message));
  await page.getByText("来源画布已确认。", { exact: true }).waitFor();
  assert.match(page.url(), /sourceTab=/);
  assert.match(page.url(), new RegExp(`canvasId=${canvas}`));
  await page.getByRole("button", { name: "扫描此画布", exact: true }).click();
  await page.getByText("扫描完成，请选择保存目录。", { exact: true }).waitFor();
  assert.equal(await page.locator("#graph").innerText(), "2 / 1");
  assert.equal(await page.locator(".asset-item").count(), 2);
  assert(requests.some(url => url.includes("cursor=page-two")), "full pagination includes offscreen nodes");
  await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("backup-flow-fixture", { create: true });
    window.showDirectoryPicker = async () => root;
  });
  await page.getByRole("button", { name: "选择备份目录", exact: true }).click();
  await page.getByRole("button", { name: "开始备份 / 补齐", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#status").dataset.state === "partial");
  const first = await page.evaluate(async canvas => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("backup-flow-fixture");
    const dir = await (await root.getDirectoryHandle("tapnow-backup")).getDirectoryHandle(canvas);
    const read = async file => (await (await dir.getFileHandle(file)).getFile()).text();
    const assets = (await read("assets.ndjson")).trim().split("\n").map(JSON.parse);
    const references = (await read("references.ndjson")).trim().split("\n").map(JSON.parse);
    const saved = assets.find(item => item.status === "verified");
    let object = dir;
    const parts = saved.file.split("/");
    for (const part of parts.slice(0, -1)) object = await object.getDirectoryHandle(part);
    const bytes = await (await object.getFileHandle(parts.at(-1))).getFile();
    return { report: JSON.parse(await read("report.json")), assets, references, original: await bytes.text() };
  }, canvas);
  assert.equal(first.report.status, "partial");
  assert.equal(first.report.verifiedCount, 1);
  assert.equal(first.report.failedCount, 1);
  assert.equal(first.report.nodeCount, 2);
  assert(first.references.some(ref => ref.nodeId === "n-offscreen"));
  assert(first.references.some(ref => ref.nodeId === null), "canvas cover reference retained");
  assert.equal(first.assets.find(item => item.status === "verified").sha256, expectedHash);
  assert.equal(first.original, media.toString());
  assert(mediaHeaders.every(headers => !headers.authorization), "media never receives page bearer token");
  assert(mediaHeaders.every(headers => headers.referer === `${origin}/`), "actual DNR Referer rule applies");
  for (const width of [1440, 920, 390]) {
    await page.setViewportSize({ width, height: 960 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `backup-partial-${width}.png`), fullPage: true });
  }
  const requestCount = mediaHeaders.length;
  await page.getByRole("button", { name: "开始备份 / 补齐", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#backup").disabled && document.querySelector("#status").textContent.includes("复用 1"));
  assert.equal(mediaHeaders.slice(requestCount).filter(headers => headers.range).length, 4, "only missing target is retried; verified object reused");
  recoverMissing = true;
  await page.getByRole("button", { name: "开始备份 / 补齐", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#backup").disabled && document.querySelector("#status").dataset.state === "completed");
  assert.equal(await page.locator("#counts").innerText(), "2 / 0 / 0");
  assert.equal(await page.locator('.asset-state[data-state="verified"]').count(), 2);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: path.join(output, "backup-completed-1440.png"), fullPage: true });
  await source.evaluate(next => history.pushState({}, "", `/p/${next}?t=c`), next);
  await page.getByText("来源画布已改变，已清空旧扫描结果；未自动选择其他画布。", { exact: true }).waitFor();
  assert.equal(await page.locator("#backup").isDisabled(), true);
  assert.equal(await page.locator(".asset-item").count(), 0);
  await source.evaluate(() => history.pushState({}, "", "/home"));
  await source.waitForFunction(() => !document.querySelector("#tapnow-backup-host").matches(":popover-open"));
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, version: JSON.parse(await fs.readFile(path.join(extension, "manifest.json"), "utf8")).version, report: first.report, mediaRequests: mediaHeaders.length, errors }, null, 2));
  console.log("PASS: actual MV3 backup on new canvas route, bridge, paginated scan, original download, SHA-256/readback, partial failure, incremental reuse and source invalidation");
} finally {
  await context.close();
  await new Promise(resolve => mediaServer.close(resolve));
  await fs.rm(profile, { recursive: true, force: true });
}
