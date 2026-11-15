import { parseRuntimeConfig } from "./runtime-config";

const HOST = "com.acucompute.tapnow";

interface NativeAPI {
  sendNativeMessage(host: string, message: unknown): Promise<any>;
  getManifest(): { version: string };
}
interface LocalStorage {
  get(keys: string[] | null): Promise<Record<string, any>>;
  set(value: Record<string, unknown>): Promise<void>;
}

export async function connectRuntime(edition: "backup" | "companion", runtime: NativeAPI, storage: LocalStorage): Promise<void> {
  const version = runtime.getManifest().version;
  // Retry a saved acknowledgement without requesting or writing the key again.
  const previous = await storage.get(["runtimePendingReceipt", "runtimeConnection", "apiKey"]);
  const savedReceipt = previous.runtimePendingReceipt as { grant?: unknown; version?: unknown } | undefined;
  if (savedReceipt?.version === version && typeof savedReceipt.grant === "string") {
    if (edition === "companion") parseRuntimeConfig(JSON.stringify({ kind: "acu-tapnow-companion", schema: 1,
      apiKey: previous.apiKey, settings: previous.runtimeConnection?.settings }));
    const acknowledged = await runtime.sendNativeMessage(HOST, { action: "ack", grant: savedReceipt.grant, version, success: true });
    if (acknowledged?.ok) {
      await storage.set({ runtimePendingReceipt: null });
      return;
    }
  }
  const reply = await runtime.sendNativeMessage(HOST, { action: "connect", version,
    ...(savedReceipt?.version === version && typeof savedReceipt.grant === "string" ? { grant: savedReceipt.grant } : {}) });
  if (reply?.ok && reply.confirmed === true) {
    if (edition === "companion") {
      const current = await storage.get(["apiKey", "runtimeConnection"]);
      if (current.runtimeConnection?.version !== version || current.runtimeConnection?.grant !== reply.grant) throw new Error("本机配置或浏览器目录已改变，请在 Runtime 重新接入");
      parseRuntimeConfig(JSON.stringify({kind:"acu-tapnow-companion",schema:1,apiKey:current.apiKey,settings:current.runtimeConnection.settings}));
    } else {
      const current = await storage.get(["runtimeBackupVersion", "runtimeBackupGrant"]);
      if (current.runtimeBackupVersion !== version || current.runtimeBackupGrant !== reply.grant) throw new Error("本机配置或浏览器目录已改变，请在 Runtime 重新接入");
    }
    return;
  }
  if (!reply?.ok || typeof reply.grant !== "string" || !/^[a-f0-9]{64}$/.test(reply.grant)) {
    throw new Error(typeof reply?.error === "string" ? reply.error : "请先在 ACU Runtime 点击接入");
  }
  let committed = false;
  try {
    const receipt = { grant: reply.grant, version };
    if (edition === "companion") {
      const config = parseRuntimeConfig(JSON.stringify(reply.config));
      await storage.set({ apiKey: config.apiKey, companionTrialDefaultsVersion: 1,
        runtimeConnection: { settings: config.settings, version, grant: reply.grant }, runtimePendingReceipt: receipt });
      const check = await storage.get(["apiKey", "runtimeConnection", "runtimePendingReceipt"]);
      if (check.apiKey !== config.apiKey || check.runtimeConnection?.settings?.llmBaseUrl !== config.settings.llmBaseUrl ||
          check.runtimeConnection?.settings?.llmModel !== config.settings.llmModel ||
          check.runtimeConnection?.settings?.llmProtocol !== config.settings.llmProtocol ||
          check.runtimePendingReceipt?.grant !== reply.grant) throw new Error("配置回读未通过");
    } else {
      if (reply.config != null) throw new Error("备份插件不接收模型凭据");
      await storage.set({ runtimePendingReceipt: receipt, runtimeBackupVersion: version, runtimeBackupGrant: reply.grant });
      const check = await storage.get(["runtimePendingReceipt"]);
      if (check.runtimePendingReceipt?.grant !== reply.grant) throw new Error("配置回读未通过");
    }
    committed = true;
  } catch {
    await storage.set({ runtimePendingReceipt: null }).catch(() => {});
    await runtime.sendNativeMessage(HOST, { action: "ack", grant: reply.grant, version, success: false }).catch(() => {});
    throw new Error("插件配置保存或回读未完成，请在 Runtime 重新接入");
  }
  if (committed) {
    const result = await runtime.sendNativeMessage(HOST, { action: "ack", grant: reply.grant, version, success: true });
    if (!result?.ok) throw new Error("配置已保存，Runtime 尚未确认，请重试连接");
    await storage.set({ runtimePendingReceipt: null });
  }
}
