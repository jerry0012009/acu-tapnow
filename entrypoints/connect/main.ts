import { browser } from "wxt/browser";
import { connectRuntime } from "../../utils/runtime-native";
import { createIcons, Link2, RefreshCw, ArrowUpRight, ShieldCheck } from "lucide";
import "../../viewer/acu-theme.css";
import "./style.css";

declare const __TAPNOW_EDITION__: "backup" | "companion";
const status = document.querySelector<HTMLElement>("#status")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
createIcons({ icons: { Link2, RefreshCw, ArrowUpRight, ShieldCheck } });
let busy = false;
async function connect() {
  if (busy) return;
  busy = true; retry.disabled = true;
  status.textContent = "正在连接…";
  status.dataset.state = "busy";
  try {
    await navigator.locks.request("acu-runtime-connection", () => connectRuntime(__TAPNOW_EDITION__, browser.runtime, browser.storage.local));
    status.textContent = __TAPNOW_EDITION__ === "backup"
      ? "设置完成。打开 TapNow 画布后，点击插件中的“备份当前画布”。"
      : "设置完成。打开 TapNow 画布，刷新后开始检测节点。";
    retry.hidden = true;
    status.dataset.state = "success";
    document.querySelector<HTMLAnchorElement>("#open-tapnow")!.hidden = false;
  } catch {
    status.dataset.state = "error";
    status.textContent = "请在 ACU Runtime 点击“一键配置”，然后点击下方“重新连接”。";
  } finally { busy = false; retry.disabled = false; }
}
retry.addEventListener("click", connect);
void connect();
