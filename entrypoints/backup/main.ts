import { browser } from "wxt/browser";
import { collectPages } from "../../utils/backup/pagination";
import { discoverAssetReferences } from "../../utils/backup/discover";
import { downloadToDirectory, indexReferences, reconcileAssets, localFile, writeLocal, verifySaved, type LocalDirectory, type Result } from "../../utils/backup/engine";
import { backupSource, sourceMatches, type BackupSource } from "../../utils/backup/source";
import { TAPNOW_INTERNATIONAL_ORIGIN } from "../../utils/tapnow-site";
import { directoryHandle } from "../../utils/backup/handles";
import { backupCanvasMetadata, backupPayloadPage } from "../../utils/backup/payload";
import { createIcons, FolderOpen, RefreshCw, ScanSearch, ExternalLink, Download, Pause, HardDrive, ShieldCheck, Layers } from "lucide";
import "../../viewer/acu-theme.css";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<header class="acu-brandbar"><div class="acu-brand"><span class="acu-mark" aria-hidden="true">A</span><div><span class="acu-wordmark">ACU</span><span class="acu-edition">TapNow · 资产备份</span></div></div><span class="acu-version">本地工作空间</span></header>
<div class="backup-heading"><div><p class="acu-eyebrow">TAPNOW BACKUP</p><h1>资产备份</h1><p>画布、原始素材与创作记录</p></div><button id="open-library"><i data-lucide="folder-open" aria-hidden="true"></i>本地资产库</button></div>
<div class="backup-workspace">
<section class="step"><div class="step-label"><span>01</span>备份画布</div>
<div class="row"><select id="canvas" aria-label="选择备份画布"></select><button id="refresh-tabs" title="更新已打开的画布列表"><i data-lucide="refresh-cw"></i>更新列表</button></div>
<div class="canvas-identity"><i data-lucide="layers" aria-hidden="true"></i><div><h2 id="target-name">尚未选择画布</h2><div id="target-id"></div></div></div><p id="origin" class="muted"></p>
<div class="row"><span id="connection">未连接</span><button id="source" disabled><i data-lucide="external-link"></i>查看原画布</button><button id="connect" disabled><i data-lucide="refresh-cw"></i>重新连接</button></div>
<button id="scan" class="primary" disabled><i data-lucide="scan-search"></i>扫描此画布</button><p id="scan-summary" class="muted">尚未扫描</p></section>
<section class="step"><div class="step-label"><span>02</span>保存位置</div><div class="destination-heading"><i data-lucide="hard-drive" aria-hidden="true"></i><h2>本机目录</h2></div>
<div class="row"><button id="choose"><i data-lucide="folder-open"></i>选择备份目录</button><span id="directory">未选择</span></div>
<p id="destination">未选择保存目录</p>
<div class="row"><label>本轮新增上限 <input id="limit" type="number" value="20" min="0.1" step="0.1"> GiB</label><span class="muted">用户设定上限，非磁盘剩余空间</span></div>
</section></div><section class="step execution"><div class="execution-heading"><div class="step-label"><span>03</span>执行备份</div><div class="row"><button id="backup" class="primary" disabled><i data-lucide="download"></i>开始备份 / 补齐</button><button id="pause" disabled><i data-lucide="pause"></i>暂停</button></div></div>
<div class="metrics"><span>节点 / 连线<b id="graph">-</b></span><span>引用 / 唯一目标<b id="assets">-</b></span><span>已验证 / 待处理 / 失败<b id="counts">-</b></span><span>已写入<b id="bytes">0 GB</b></span></div>
<progress id="progress" aria-label="备份进度" max="1" value="0"></progress><p id="status" role="status">正在读取来源画布...</p>
<div class="integrity-note"><i data-lucide="shield-check" aria-hidden="true"></i><span>SHA-256 校验 · 本地保存</span></div></section>
<section class="asset-section" aria-label="素材清单"><div class="asset-heading"><h2>素材清单</h2><span id="asset-count">尚未扫描</span></div><div id="asset-list" class="asset-list"><p class="empty-assets">扫描后显示原始素材及下载结果</p></div></section>`;
createIcons({ icons: { FolderOpen, RefreshCw, ScanSearch, ExternalLink, Download, Pause, HardDrive, ShieldCheck, Layers } });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let directory: LocalDirectory | null = null;
let snapshot: any = null;
let running = false;
let downloading = false;
let target: (BackupSource & { name: string }) | null = null;
let generation = 0;
let scanInvalidated = false;
const query = new URLSearchParams(location.search);
let controller: AbortController | null = null;
const record = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const setStatus = (v: string) => $("status").textContent = v;
const runLabels: Record<string, string> = { running: "正在备份", paused: "已暂停", completed: "备份完成", partial: "部分素材未完成", "storage-budget-exceeded": "保存空间或本轮上限不足" };
const assetLabels: Record<string, string> = { discovered: "待下载", queued: "待处理", verified: "已校验", retryable: "可重试", "unavailable-after-recovery": "来源不可用" };
function renderAssets(assets: Result[]) {
  $("asset-count").textContent = `${assets.length} 个资源目标`;
  const list = $("asset-list");
  list.replaceChildren();
  if (!assets.length) { const empty = document.createElement("p"); empty.className = "empty-assets"; empty.textContent = "此画布没有可下载的素材，节点与连线仍可备份。"; list.append(empty); return; }
  for (const asset of assets.slice(0, 100)) {
    const row = document.createElement("div"); row.className = "asset-item";
    const label = document.createElement("div"); label.className = "asset-name";
    const title = document.createElement("strong");
    let filename = asset.fileId || asset.assetId;
    if (asset.url) { try { filename = decodeURIComponent(new URL(asset.url).pathname.split("/").pop() || filename); } catch { /* Keep the asset ID when a URL is malformed. */ } }
    title.textContent = filename;
    const location = document.createElement("small"); location.textContent = `${asset.nodeId || "画布"} · ${asset.fieldPath}`;
    label.append(title, location);
    if (asset.reason) { const reason = document.createElement("p"); reason.textContent = asset.reason; label.append(reason); }
    const state = document.createElement("span"); state.className = "asset-state"; state.dataset.state = asset.status; state.textContent = assetLabels[asset.status] || asset.status;
    row.append(label, state); list.append(row);
  }
  if (assets.length > 100) { const more = document.createElement("p"); more.className = "empty-assets"; more.textContent = `显示前 100 项；完整 ${assets.length} 项保存在备份清单中。`; list.append(more); }
}
$("open-library").onclick = async () => {
  try {
    const params = new URLSearchParams();
    if (directory) {
      const key = `backup-${await browser.tabs.getCurrent().then(tab => tab?.id || "current")}`;
      await directoryHandle(key, directory);
      params.set("directory", key);
      if (snapshot?.canvasId || target?.canvasId) params.set("canvasId", snapshot?.canvasId || target!.canvasId);
    }
    await browser.tabs.create({ url: `${browser.runtime.getURL("/library.html")}?${params}` });
  } catch (error) { setStatus(`打开本地查看器失败：${String(error)}`); }
};
const setBusy = (busy: boolean) => {
  running = busy;
  for (const id of ["choose", "connect", "scan", "canvas", "limit", "refresh-tabs"]) ($<HTMLButtonElement>(id)).disabled = busy;
  for (const id of ["connect", "scan", "source"]) $<HTMLButtonElement>(id).disabled = busy || !target;
  $<HTMLButtonElement>("backup").disabled = busy || !directory || !snapshot;
  $<HTMLButtonElement>("pause").disabled = !downloading;
};
async function tabs() {
  return (await browser.tabs.query({})).flatMap(tab => {
    const source = backupSource(tab);
    return source ? [{ ...source, name: tab.title || source.canvasId }] : [];
  });
}
const sourceLabel = (source: BackupSource) => new URL(source.origin).hostname;
function resetScan(message = "尚未扫描") {
  snapshot = null;
  for (const id of ["graph", "assets", "counts"]) $(id).textContent = "-";
  $("bytes").textContent = "0 B";
  delete $("status").dataset.state;
  $<HTMLProgressElement>("progress").value = 0;
  $("scan-summary").textContent = message;
  $("asset-count").textContent = "尚未扫描";
  $("asset-list").replaceChildren();
  $<HTMLButtonElement>("backup").disabled = true;
}
function destination() {
  $("destination").textContent = directory && target ? `${directory.name}/tapnow-backup/${target.canvasId}` : "未选择保存目录";
}
function updateName(name: string) {
  if (!target) return;
  target.name = name;
  $("target-name").textContent = name;
  document.title = `${name} · TapNow 备份中心`;
  const option = [...$<HTMLSelectElement>("canvas").options].find(o => o.value === String(target!.tabId));
  if (option) option.textContent = `${name} · ${sourceLabel(target)} · 标签页 ${target.tabId}`;
}
async function checkSource(source: BackupSource) {
  const tab = await browser.tabs.get(source.tabId);
  if (!sourceMatches(tab, source)) throw new Error("原标签页已切换站点或画布，请更新列表并重新扫描。");
  return tab;
}
async function ensureConnection() {
  if (!target) throw new Error("请先选择具体画布。");
  const { tabId, canvasId, origin } = target;
  const result = await browser.runtime.sendMessage({ type: "tapnow:ensure-backup-bridge", source: { tabId, canvasId, origin } });
  if (!result?.ok) throw new Error(result?.error || "页面通信未建立");
  if (!snapshot && result.title) updateName(result.title.split(/\s[|｜]\s*/)[0]);
  $("connection").textContent = result.hasSession ? "已连接 · 页面有登录会话" : "已连接 · 请在原画布登录";
  $("connection").dataset.state = result.hasSession ? "ready" : "waiting";
  if (!result.hasSession) throw new Error("页面通信已建立，但没有登录会话。请点击“查看原画布”登录。");
}
async function api(tabId: number, endpoint: string) {
  if (!target || target.tabId !== tabId || scanInvalidated) throw new Error("扫描来源已改变，请重新扫描。");
  let result;
  try {
    result = await browser.tabs.sendMessage(tabId, { type: "tapnow:backup-v2-json", endpoint, expectedCanvasId: target.canvasId, expectedOrigin: target.origin }, { frameId: 0 });
  } catch {
    throw new Error("与原画布的连接已中断，请点击“重新连接”。");
  }
  if (!result?.ok) throw new Error(result?.error || "画布未返回有效响应，请点击“重新连接”后再扫描。");
  return result.body;
}
async function selectTarget(tabId: number, expected?: BackupSource) {
  generation++;
  resetScan();
  target = null;
  $("connection").textContent = "未连接";
  $("target-name").textContent = "尚未选择画布";
  $("target-id").textContent = "";
  document.title = "选择画布 · TapNow 备份中心";
  if (!tabId) { destination(); return; }
  const tab = await browser.tabs.get(tabId);
  const source = backupSource(tab);
  if (!source || expected && !sourceMatches(tab, expected)) throw new Error("来源画布已改变，未自动改选其他画布。请更新列表后明确选择。");
  target = { ...source, name: tab.title?.split(/\s[|｜]\s*/)[0] || source.canvasId };
  updateName(target.name);
  $("target-id").textContent = `${sourceLabel(source)} · 画布 ID：${source.canvasId}`;
  destination();
  try { await ensureConnection(); setStatus("来源画布已确认。"); }
  catch (error) { $("connection").textContent = "未就绪"; setStatus(String(error)); }
}
async function refreshCanvasList(initial = false) {
  const remembered = target;
  const select = $<HTMLSelectElement>("canvas");
  select.replaceChildren(new Option("请选择具体画布（非项目列表）", ""));
  const available = await tabs();
  for (const source of available) {
    select.append(new Option(`${source.name} · ${sourceLabel(source)} · 标签页 ${source.tabId}`, String(source.tabId)));
  }
  const wanted = initial ? {
    tabId: Number(query.get("sourceTab")),
    canvasId: query.get("canvasId"),
    origin: query.get("sourceOrigin") ?? TAPNOW_INTERNATIONAL_ORIGIN
  } : remembered;
  const found = available.find(source => source.tabId === wanted?.tabId && source.canvasId === wanted.canvasId && source.origin === wanted.origin);
  if (found) {
    select.value = String(found.tabId);
    if (!target) await selectTarget(found.tabId, found);
  } else {
    await selectTarget(0);
    setStatus(wanted?.canvasId ? "原来源标签页已关闭或切换，未自动选择其他画布。" : available.length ? "请从列表明确选择要备份的画布。" : "没有打开的具体画布。请在 TapNow 项目列表中打开一张画布，再点击它的“备份此画布”。");
  }
  $("origin").textContent = initial && query.get("canvasId") ? "来源：你点击“备份此画布”的标签页" : query.get("from") === "projects" ? "来源：画布工作区；仅备份上方选中的单画布" : "范围：上方选中的单画布";
}
async function connect() {
  await ensureConnection();
  setStatus(snapshot ? `已重新连接「${target!.name}」，原扫描结果仍属于此画布。` : `已连接「${target!.name}」，可以扫描。`);
}
async function scan() {
  resetScan("正在扫描...");
  scanInvalidated = false;
  if (!target) throw new Error("请先选择具体画布。");
  const selected = { ...target }, version = generation;
  setStatus("正在读取节点、连线分页及资源引用...");
  await ensureConnection();
  const tabId = selected.tabId, id = selected.canvasId;
  const base = `/api/canvas/v1/canvases/${encodeURIComponent(id)}`;
  const page = async (kind: "nodes" | "connections") => collectPages(async cursor => {
    const q = new URLSearchParams({ limit: "500" }); if (kind === "nodes") q.set("include_relations", "true"); if (cursor) q.set("cursor", cursor);
    return backupPayloadPage(await api(tabId, `${base}/${kind}?${q}`), kind);
  }, item => String(record(item).id));
  const canvasPayload = await api(tabId, `${base}?with_nodes=true&with_connections=true`);
  const canvas = backupCanvasMetadata(canvasPayload, id);
  const nodes = await page("nodes"), connections = await page("connections");
  if (!nodes.diagnostic.complete || !connections.diagnostic.complete) throw new Error("分页不完整，未进入下载");
  await checkSource(selected);
  if (scanInvalidated || version !== generation) throw new Error("扫描期间来源已改变，请重新扫描。");
  const refs = nodes.items.flatMap(node => discoverAssetReferences(id, String(record(node).id), record(node).data));
  const { nodes: _nodes, connections: _connections, ...metadata } = canvas;
  refs.push(...discoverAssetReferences(id, null, metadata, { fieldPrefix: "canvas" }));
  const indexed = indexReferences(refs);
  snapshot = { sourceTabId: tabId, sourceOrigin: selected.origin, canvasId: id, canvasName: String(canvas.name || selected.name), canvas, nodes: nodes.items, connections: connections.items, ...indexed, diagnostics: { nodes: nodes.diagnostic, connections: connections.diagnostic } };
  updateName(snapshot.canvasName);
  $("scan-summary").textContent = `已扫描「${snapshot.canvasName}」 · ${nodes.items.length} 节点 · ${connections.items.length} 连线 · ${indexed.assets.length} 资源目标`;
  $("graph").textContent = `${nodes.items.length} / ${connections.items.length}`;
  $("assets").textContent = `${refs.length} / ${indexed.assets.length}`;
  renderAssets(indexed.assets);
  $<HTMLButtonElement>("backup").disabled = !directory;
  setStatus(directory ? "扫描完成，可以开始备份。" : "扫描完成，请选择保存目录。");
}
async function backup() {
  if (!directory || !snapshot) throw new Error("先选择目录并扫描画布");
  if (!target || snapshot.canvasId !== target.canvasId || snapshot.sourceTabId !== target.tabId || snapshot.sourceOrigin !== target.origin) throw new Error("选择与扫描结果不一致，请重新扫描。");
  const { tabId, canvasId, origin } = target;
  const maxBytes = Number($<HTMLInputElement>("limit").value) * 1024 ** 3; if (!Number.isFinite(maxBytes) || !(maxBytes > 0)) throw new Error("上限必须大于 0");
  const prepared = await browser.runtime.sendMessage({ type: "tapnow:prepare-backup", source: { tabId, canvasId, origin } });
  if (!prepared?.ok) throw new Error(prepared?.error || "媒体请求准备失败，请在扩展管理页面重新加载扩展");
  const base = await directory.getDirectoryHandle("tapnow-backup", { create: true });
  const root = await base.getDirectoryHandle(snapshot.canvasId, { create: true });
  let previousRunId = "";
  try {
    const previousReport = JSON.parse(await (await (await localFile(root, "report.json")).getFile()).text());
    // Pre-multisite reports could only have been created from the international site.
    if ((previousReport.sourceOrigin ?? TAPNOW_INTERNATIONAL_ORIGIN) !== origin) {
      throw new Error("此目录已备份另一站点的同 ID 画布，请选择其他备份目录。");
    }
    if (/^run-\d+$/.test(previousReport.runId)) previousRunId = previousReport.runId;
  } catch (error) {
    if ((error as Error).name !== "NotFoundError") throw error;
  }
  const previous = new Map<string, Result>();
  try { const file = await (await localFile(root, "assets.ndjson")).getFile(); for (const line of (await file.text()).split("\n").filter(Boolean)) { const x = JSON.parse(line); previous.set(x.assetId, x); } }
  catch (error) { if ((error as Error).name !== "NotFoundError") throw new Error("已有清单无法读取，未覆盖。请检查目录权限或文件格式。"); }
  const targets = reconcileAssets(snapshot.assets, previous.values());
  const results = new Map<string, Result>(targets.map(asset => [asset.assetId, { ...previous.get(asset.assetId), ...asset, status: "queued" }]));
  let processed = 0, added = 0, reused = 0, stopped = false, finished = false;
  controller = new AbortController();
  const runId = `run-${Date.now()}`; const ndjson = (xs: unknown[]) => xs.map(x => JSON.stringify(x)).join("\n") + "\n";
  if (previous.size && previousRunId) {
    await writeLocal(root, `runs/${previousRunId}/assets.ndjson`, ndjson([...previous.values()]));
  }
  await writeLocal(root, `runs/${runId}/snapshot.json`, JSON.stringify(snapshot));
  await writeLocal(root, "canvas.json", JSON.stringify(snapshot.canvas));
  await writeLocal(root, "nodes.ndjson", ndjson(snapshot.nodes));
  await writeLocal(root, "connections.ndjson", ndjson(snapshot.connections));
  await writeLocal(root, "references.ndjson", ndjson(snapshot.references));
  let persistQueue = Promise.resolve();
  const persist = async () => {
    const all = [...results.values()], ok = all.filter(x => x.status === "verified");
    $("counts").textContent = `${ok.length} / ${all.filter(x => x.status === "queued").length} / ${all.filter(x => x.status !== "verified" && x.status !== "queued").length}`;
    const unit = added >= 1e9 ? "GB" : added >= 1e6 ? "MB" : added >= 1e3 ? "KB" : "B";
    const divisor = { GB: 1e9, MB: 1e6, KB: 1e3, B: 1 }[unit];
    $("bytes").textContent = `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(added / divisor)} ${unit}`;
    $<HTMLProgressElement>("progress").max = Math.max(1, targets.length); $<HTMLProgressElement>("progress").value = targets.length ? processed : finished ? 1 : 0;
    const report = {
      schema_version: 1, producer: "chrome-extension", transport: "extension-fetch", writer: "FileSystemAccess", runId,
      canvasId: snapshot.canvasId, sourceOrigin: origin, canvasName: snapshot.canvasName, nodeCount: snapshot.nodes.length,
      nodeTypes: snapshot.nodes.reduce((counts: Record<string, number>, node: any) => { const type = node.type || "unknown"; counts[type] = (counts[type] || 0) + 1; return counts; }, {}),
      connectionCount: snapshot.connections.length, referenceCount: snapshot.references.length, uniqueAssetCount: targets.length,
      currentScanAssetCount: snapshot.assets.length, retainedAssetCount: targets.length - snapshot.assets.length,
      verifiedCount: ok.length, failedCount: all.filter(x => !["verified", "queued"].includes(x.status)).length,
      pendingCount: all.filter(x => x.status === "queued").length, processed, reusedCount: reused, newBytes: added,
      verifiedBytes: ok.reduce((s, a) => s + (a.bytes || 0), 0),
      physicalBytes: [...new Map(ok.map(a => [a.file, a.bytes || 0])).values()].reduce((a,b) => a+b,0),
      status: stopped ? "storage-budget-exceeded" : controller!.signal.aborted ? "paused" : finished ? (ok.length === targets.length ? "completed" : "partial") : "running",
      limitBytes: maxBytes, diagnostics: snapshot.diagnostics, updatedAt: new Date().toISOString(),
      ...(finished ? { finishedAt: new Date().toISOString() } : {})
    };
    $("status").dataset.state = report.status;
    setStatus(`${runLabels[report.status] || report.status} · ${processed}/${targets.length} · 已校验 ${ok.length} · 复用 ${reused}`);
    renderAssets(all);
    persistQueue = persistQueue.then(async () => {
      await writeLocal(root, "assets.ndjson", ndjson(all));
      await writeLocal(root, "report.json", JSON.stringify(report, null, 2));
      await writeLocal(root, `runs/${runId}/report.json`, JSON.stringify(report, null, 2));
      await writeLocal(root, `runs/${runId}/assets.ndjson`, ndjson(all));
    });
    await persistQueue;
  };
  await persist();
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const asset = targets[cursor++];
      if (!asset || controller!.signal.aborted || stopped) return;
      const old = previous.get(asset.assetId);
      if (old?.file && old.sha256 && await verifySaved(root, { ...old, status: "verified" })) { results.set(asset.assetId, { ...old, ...asset, status: "verified", reused: true }); reused++; processed++; await persist(); continue; }
      try {
        const result = await downloadToDirectory(root, asset, { signal: controller!.signal, claim: bytes => { if (added + bytes > maxBytes) throw new Error("storage-budget-exceeded"); added += bytes; }, release: bytes => { added = Math.max(0, added - bytes); } });
        results.set(asset.assetId, result); if (/storage-budget|QuotaExceeded|NotAllowed|No space/i.test(result.reason || "")) stopped = true;
      } catch (error) { results.set(asset.assetId, { ...asset, status: "retryable", reason: String(error) }); }
      processed++; await persist();
    }
  };
  const workers = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    try { await worker(); } catch (error) { controller?.abort(); throw error; }
  }));
  const rejected = workers.find(w => w.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  finished = true; await persist();
}
$("choose").onclick = async () => { try { directory = await (window as any).showDirectoryPicker({ mode: "readwrite", id: "tapnow-backup" }); $("directory").textContent = directory.name; destination(); $<HTMLButtonElement>("backup").disabled = !snapshot || running; setStatus(snapshot ? `保存目录已确认，可以备份「${snapshot.canvasName}」。` : `已选择目录：${directory.name}`); } catch (e) { setStatus(String(e)); } };
$("canvas").onchange = async () => {
  setBusy(true);
  try { await selectTarget(Number($<HTMLSelectElement>("canvas").value)); $("origin").textContent = "范围：你手动选择的单画布"; }
  catch (error) { setStatus(String(error)); }
  finally { setBusy(false); }
};
$("refresh-tabs").onclick = async () => { setBusy(true); try { await refreshCanvasList(); } catch (e) { setStatus(String(e)); } finally { setBusy(false); } };
$("source").onclick = async () => {
  if (!target) return;
  try { const tab = await checkSource(target); await browser.tabs.update(tab.id!, { active: true }); await browser.windows.update(tab.windowId, { focused: true }); }
  catch (error) { setStatus(String(error)); }
};
$("connect").onclick = async () => { setBusy(true); try { await connect(); } catch (e) { setStatus(String(e)); } finally { setBusy(false); } };
$("scan").onclick = async () => { setBusy(true); try { await scan(); } catch (e) { resetScan("扫描未完成"); setStatus(String(e)); } finally { setBusy(false); } };
$("backup").onclick = async () => {
  if (running) return;
  downloading = true;
  setBusy(true);
  try {
    await navigator.locks.request("tapnow-backup-writer", { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("另一个备份页正在运行");
      await backup();
    });
  } catch (e) { controller?.abort(); setStatus(`备份未完成：${String(e)}。已完成文件保留，可增量补齐。`); }
  finally { downloading = false; setBusy(false); }
};
$("pause").onclick = () => controller?.abort();
function invalidateSource(tabId: number, url?: string, closed = false) {
  if (target?.tabId !== tabId || !closed && sourceMatches({ id: tabId, url }, target)) return;
  if (downloading) return; // Downloads use an immutable saved snapshot, not the live page.
  generation++; scanInvalidated = true;
  resetScan("原页面已关闭或切换，请重新选择并扫描");
  target = null;
  $("target-name").textContent = "来源画布已失效";
  $("target-id").textContent = "";
  document.title = "来源已失效 · TapNow 备份中心";
  $<HTMLSelectElement>("canvas").value = "";
  $("connection").textContent = "来源已失效";
  destination();
  setStatus("来源画布已改变，已清空旧扫描结果；未自动选择其他画布。");
  setBusy(running);
}
browser.tabs.onUpdated.addListener((tabId, change) => { if (change.url) invalidateSource(tabId, change.url); });
browser.tabs.onRemoved.addListener(tabId => invalidateSource(tabId, undefined, true));
setBusy(true);
void refreshCanvasList(true).catch(e => setStatus(String(e))).finally(() => setBusy(false));
window.addEventListener("beforeunload", event => { if (running) { event.preventDefault(); event.returnValue = ""; } });
