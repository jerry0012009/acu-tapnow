import test from "node:test";
import assert from "node:assert/strict";
import { backupCanvasMetadata, backupPayloadPage } from "../utils/backup/payload";

test("direct and wrapped current canvas metadata preserve identity and media fields", () => {
  const canvas = { id: "canvas-a", name: "品牌影片", preview_image: "https://files.tapnow.media/cover" };
  for (const data of [canvas, { canvas }]) assert.deepEqual(backupCanvasMetadata({ code: 0, data }, "canvas-a"), canvas);
  assert.throws(() => backupCanvasMetadata({ data: canvas }, "canvas-b"), /不一致/);
});

test("paginated full nodes retain nested current, alternate and historic assets", () => {
  const node = { id: "n", data: { src: "https://files.tapnow.media/main", history: [{ file_id: "historic" }] } };
  const page = backupPayloadPage({ code: 0, data: { nodes: [node], has_more: true, next_cursor: "next", total: 2 } }, "nodes");
  assert.deepEqual(page, { items: [node], hasMore: true, nextCursor: "next", total: 2 });
  assert.deepEqual(backupPayloadPage({ data: { connections: [], has_more: false, total: 0 } }, "connections").items, []);
});

test("HTTP-success permission errors, unknown pages and missing cursors never look complete", () => {
  for (const payload of [{ code: 403, data: {} }, { data: {} }, { data: { nodes: [{ id: "n" }] } }, { data: { nodes: [{ id: "n" }], has_more: true } }, { data: { nodes: [{}], has_more: false } }, { data: { nodes: [], has_more: false, total: -1 } }]) {
    assert.throws(() => backupPayloadPage(payload, "nodes"));
  }
});
