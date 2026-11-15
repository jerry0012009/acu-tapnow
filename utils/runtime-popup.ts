import { connectRuntime } from "./runtime-native";

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
    } catch {
      status.textContent = "请在 ACU Runtime 点击“一键配置”，然后在这里重试。";
    } finally {
      busy = false; button.disabled = false;
    }
  };
  button.addEventListener("click", connect);
  // Opening the installed popup is enough when Runtime already has a grant.
  // No pending grant means no credential write or inference request.
  void connect();
}
