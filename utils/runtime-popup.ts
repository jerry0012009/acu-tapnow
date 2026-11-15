import { connectRuntime } from "./runtime-native";
import { parseRuntimeConfig } from "./runtime-config";

type Runtime = Parameters<typeof connectRuntime>[1];
type Storage = Parameters<typeof connectRuntime>[2];

export function bindRuntimePopup(
  button: HTMLButtonElement, status: HTMLElement,
  edition: "companion" | "backup", runtime: Runtime, storage: Storage,
  onConnected: () => Promise<void> = async () => {}
) {
  let busy = false;
  const connect = async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    status.textContent = "正在连接…";
    try {
      await navigator.locks.request("acu-runtime-connection", () => connectRuntime(edition, runtime, storage));
      await onConnected();
      status.textContent = edition === "companion"
        ? "已连接。刷新 TapNow 画布后开始检测。"
        : "已连接。打开画布后点击“备份当前画布”。";
    } catch (error) {
      const saved = await storage.get(["apiKey", "runtimeConnection", "runtimePendingReceipt", "runtimeBackupVersion"]).catch(() => ({} as Record<string, any>));
      let usable = false;
      if (!saved.runtimePendingReceipt) {
        if (edition === "companion" && saved.runtimeConnection) {
          try {
            parseRuntimeConfig(JSON.stringify({kind:"acu-tapnow-companion",schema:1,
              apiKey:saved.apiKey,settings:saved.runtimeConnection.settings}));
            usable = true;
          } catch { /* Keep invalid stored settings visibly disconnected. */ }
        } else if (edition === "backup" && saved.runtimeBackupVersion) usable = true;
      }
      if (usable) {
        await onConnected();
        status.textContent = edition === "companion"
          ? "本机配置已保存，可直接使用副驾驶。更新 Key 或模型时，在 Runtime 的副驾驶一栏点击“更新并配置”。"
          : "本机配置已保存，可直接备份画布。";
      } else {
        const detail = error instanceof Error ? error.message : "本机连接暂不可用";
        status.textContent = `${detail}。在 Runtime 的“${edition === "companion" ? "副驾驶" : "资产备份"}”一栏点击“重新连接”，再在这里重试。`;
      }
    } finally {
      busy = false; button.disabled = false;
    }
  };
  button.addEventListener("click", connect);
  // Opening the installed popup is enough when Runtime already has a grant.
  // No pending grant means no credential write or inference request.
  void connect();
}
