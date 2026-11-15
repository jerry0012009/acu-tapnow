import { browser } from "wxt/browser";
import { createIcons, Download, FolderOpen, ArrowUpRight, HardDrive, Link2 } from "lucide";
import "../../../viewer/acu-theme.css";
import "../../../utils/acu-popup.css";
import { bindRuntimePopup } from "../../../utils/runtime-popup";
bindRuntimePopup(document.getElementById("runtime-connect") as HTMLButtonElement,
  document.getElementById("runtime-status")!, "backup", browser.runtime, browser.storage.local);
document.getElementById("version")!.textContent = `v${browser.runtime.getManifest().version}`;
createIcons({ icons: { Download, FolderOpen, ArrowUpRight, HardDrive, Link2 } });
for (const [id, type] of [["backup", "tapnow:open-backup"], ["library", "tapnow:open-library"]]) {
  document.getElementById(id)!.onclick = async () => {
    try {
      const result = await browser.runtime.sendMessage({ type });
      if (!result?.ok) throw new Error(result?.error || "无法打开");
      window.close();
    } catch (error) { document.getElementById("status")!.textContent = String(error); }
  };
}
