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
    status.textContent = "正在连接 ACU Runtime";
    try {
      await navigator.locks.request("acu-runtime-connection", () => connectRuntime(edition, runtime, storage));
      await onConnected();
      status.textContent = edition === "companion"
        ? "API Key 与模型已配置，Runtime 已确认；刷新已打开的画布后生效。"
        : "备份插件已连接；不使用 API Key。";
    } catch {
      status.textContent = "尚未确认连接。请先在 Runtime 点击一键配置，再点击这里重试；无需复制 Key。";
    } finally {
      busy = false; button.disabled = false;
    }
  };
  button.addEventListener("click", connect);
  // Opening the installed popup is enough when Runtime already has a grant.
  // No pending grant means no credential write or inference request.
  void connect();
}
