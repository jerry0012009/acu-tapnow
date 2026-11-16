import type { PageResult } from "./pagination";

export function backupPayloadData(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("TapNow 返回了无效的备份数据。");
  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.code === "number" && envelope.code !== 0) throw new Error("TapNow 未允许读取该画布，请确认登录和画布权限。");
  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("TapNow 返回的数据结构不完整，未开始下载。");
  return data as Record<string, unknown>;
}

export function backupCanvasMetadata(payload: unknown, expectedId: string): Record<string, unknown> {
  const data = backupPayloadData(payload);
  const candidate = data.canvas ?? data;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("画布信息缺失。");
  const canvas = candidate as Record<string, unknown>;
  if (canvas.id !== expectedId) throw new Error("返回的画布与当前来源不一致，未开始下载。");
  return canvas;
}

export function backupPayloadPage(payload: unknown, kind: "nodes" | "connections"): PageResult<Record<string, unknown>> {
  const data = backupPayloadData(payload);
  const items = data[kind];
  if (!Array.isArray(items) || items.some(item => !item || typeof item !== "object" || typeof item.id !== "string" || !item.id)) {
    throw new Error(`${kind === "nodes" ? "节点" : "连线"}列表缺失或包含无效 ID，未开始下载。`);
  }
  if (typeof data.has_more !== "boolean") throw new Error("分页完成标记缺失，未开始下载。");
  if (data.has_more && (typeof data.next_cursor !== "string" || !data.next_cursor)) throw new Error("分页游标缺失，未开始下载。");
  if (data.total != null && (typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0)) throw new Error("分页总数无效。");
  return { items, hasMore: data.has_more, nextCursor: typeof data.next_cursor === "string" ? data.next_cursor : null, total: typeof data.total === "number" ? data.total : null };
}
