import { browser } from "wxt/browser";
import { connectRuntime } from "../../utils/runtime-native";
import "./style.css";

declare const __TAPNOW_EDITION__: "backup" | "companion";
const status = document.querySelector<HTMLElement>("#status")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
let busy = false;
async function connect() {
  if (busy) return;
  busy = true; retry.disabled = true;
  status.textContent = "正在连接 ACU Runtime";
  try {
    await navigator.locks.request("acu-runtime-connection", () => connectRuntime(__TAPNOW_EDITION__, browser.runtime, browser.storage.local));
    status.textContent = __TAPNOW_EDITION__ === "backup"
      ? "资产备份已就绪。请在 Chrome 中打开并登录自己的 TapNow 画布。"
      : "ACU 模型与 Key 已配置。请在 Chrome 中打开自己的 TapNow 画布，节点检测可能产生费用。";
    retry.hidden = true;
    document.querySelector<HTMLAnchorElement>("#open-tapnow")!.hidden = false;
  } catch (error) {
    status.textContent = error instanceof Error && !/native|host|messaging/i.test(error.message)
      ? error.message : "ACU Runtime 连接组件暂不可用，请在 Runtime 重新点击接入。";
  } finally { busy = false; retry.disabled = false; }
}
retry.addEventListener("click", connect);
void connect();
