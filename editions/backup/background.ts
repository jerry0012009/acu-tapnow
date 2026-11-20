import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { backupPageQuery, sourceMatches } from "../../utils/backup/source";
import { tapnowOrigin } from "../../utils/tapnow-site";
import { messageListener } from "../../utils/messages";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") void browser.tabs.create({ url: browser.runtime.getURL("/connect.html") });
  });
  browser.runtime.onMessage.addListener(messageListener<Browser.runtime.MessageSender>([
    "tapnow:ensure-backup-bridge", "tapnow:prepare-backup", "tapnow:open-backup", "tapnow:open-library"
  ], async (message, sender) => {
    if (message.type === "tapnow:ensure-backup-bridge" || message.type === "tapnow:prepare-backup") {
      if (sender.id !== browser.runtime.id || sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL("/backup.html")) {
        return { ok: false, error: "Invalid caller" };
      }
      try {
        const source = message.source;
        const tab = await browser.tabs.get(source.tabId);
        if (!sourceMatches(tab, source)) throw new Error("来源标签页已关闭或切换，请重新选择画布。");
        if (message.type === "tapnow:prepare-backup") {
          await browser.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [9901],
            addRules: [{
              id: 9901, priority: 1,
              action: { type: "modifyHeaders", requestHeaders: [{ header: "Referer", operation: "set", value: `${source.origin}/` }] },
              condition: {
                requestDomains: ["files.tapnow.media", "files.tapnow.top"],
                initiatorDomains: [browser.runtime.id], resourceTypes: ["xmlhttprequest"]
              }
            }]
          });
          return { ok: true };
        }
        const ping = () => browser.tabs.sendMessage(source.tabId, { type: "tapnow:backup-v2-ping", expectedCanvasId: source.canvasId, expectedOrigin: source.origin }, { frameId: 0 });
        try { return await ping(); } catch {}
        await browser.scripting.executeScript({ target: { tabId: tab.id!, frameIds: [0] }, files: ["/content-scripts/backup-bridge.js"] });
        return await ping();
      } catch (error) {
        return { ok: false, error: `无法连接该画布，请检查网站访问权限及原标签页：${String(error)}` };
      }
    }
    if (message.type === "tapnow:open-library") {
      await browser.tabs.create({ url: browser.runtime.getURL("/library.html") });
      return { ok: true };
    }
    const source = tapnowOrigin(sender.tab?.url) ? sender.tab : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    const query = backupPageQuery(source);
    await browser.tabs.create({
      url: `${browser.runtime.getURL("/backup.html")}${query ? `?${query}` : ""}`,
      ...(source?.id ? { openerTabId: source.id, windowId: source.windowId } : {})
    });
    return { ok: true };
  }));
});
