import test from "node:test";
import assert from "node:assert/strict";
import { companionRoute } from "../utils/tapnow-route";

const canvas = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const origins = ["https://app.tapnow.ai", "https://app.tapnow.media"];

test("classic and V2 standalone and collection canvases resolve their canvas, not project ID", () => {
  for (const origin of origins) for (const path of [
    `/canvas/${canvas}`, `/canvas/${canvas}/?classic=1#node`,
    `/p/${canvas}?t=c`, `/p/${project}?c=${canvas}`,
    `/collection/${project}?c=${canvas}`, `/p/${canvas}?t=c&c=${project}`
  ]) assert.deepEqual(companionRoute(`${origin}${path}`), { canvasId: canvas, workspace: true });
});

test("project lists and invalid query IDs never become a canvas", () => {
  for (const origin of origins) for (const path of ["/canvas/projects", `/p/${project}`, `/p/${project}?c=undefined`, `/p/${project}?t=collection`]) {
    assert.deepEqual(companionRoute(`${origin}${path}`), { canvasId: null, workspace: true });
  }
  for (const url of ["invalid", ...[
    "https://example.com", "https://app.tapnow.media.example.com", "https://files.tapnow.media",
    "http://app.tapnow.media", "https://app.tapnow.media:8443", "https://user@app.tapnow.media"
  ].map(origin => `${origin}/p/${canvas}?t=c`), `blob:https://app.tapnow.media/canvas/${canvas}`,
  ...origins.flatMap(origin => [`${origin}/home`, `${origin}/p/not-a-uuid?t=c`])]) {
    assert.deepEqual(companionRoute(url), { canvasId: null, workspace: false });
  }
});
