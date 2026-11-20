import test from "node:test";
import assert from "node:assert/strict";
import { backupPageQuery, backupSource, canvasIdFromUrl, isTapNowWorkspace, sourceMatches } from "../utils/backup/source";
const id = "00000000-0000-4000-8000-000000000001";
const international = "https://app.tapnow.ai";
const domestic = "https://app.tapnow.media";
const url = `${international}/canvas/${id}`;
test("only concrete TapNow canvas URLs are selectable, never project lists", () => {
  assert.equal(canvasIdFromUrl(url), id);
  assert.equal(canvasIdFromUrl(`${url}?x=1#node`), id);
  for (const bad of ["https://app.tapnow.ai/canvas/projects?scope=team", "https://app.tapnow.ai/canvas/",
    `https://example.com/canvas/${id}`, "https://app.tapnow.ai/canvas/undefined"]) assert.equal(canvasIdFromUrl(bad), null);
});
test("new canvas routes resolve the selected canvas and remain bound to the source tab", () => {
  const project = "00000000-0000-4000-8000-000000000002";
  for (const origin of [international, domestic]) for (const path of [
    `/p/${project}?c=${id}`, `/collection/${project}?c=${id}`, `/p/${id}?t=c`
  ]) {
    const current = `${origin}${path}`;
    assert.equal(canvasIdFromUrl(current), id);
    assert.equal(isTapNowWorkspace(current), true);
    assert.deepEqual(backupSource({ id: 23, url: current }), { tabId: 23, canvasId: id, origin });
    const query = new URLSearchParams(backupPageQuery({ id: 23, url: current }));
    assert.equal(query.get("sourceTab"), "23");
    assert.equal(query.get("canvasId"), id);
    assert.equal(query.get("sourceOrigin"), origin);
  }
  assert.equal(canvasIdFromUrl(`https://app.tapnow.ai/p/${project}`), null);
  assert.equal(isTapNowWorkspace(`https://app.tapnow.ai/p/${project}`), true);
});
test("page entry binds origin, source tab and canvas, independent of tab ordering", () => {
  const query = new URLSearchParams(backupPageQuery({ id: 23, url }));
  assert.equal(query.get("sourceTab"), "23");
  assert.equal(query.get("canvasId"), id);
  const source = { tabId: 23, canvasId: id, origin: international };
  assert.equal(sourceMatches({ id: 23, url }, source), true);
  assert.equal(sourceMatches({ id: 24, url }, source), false);
  assert.equal(sourceMatches({ id: 23, url: `${domestic}/canvas/${id}` }, source), false);
  assert.equal(sourceMatches({ id: 23, url: `${international}/canvas/projects` }, source), false);
  assert.equal(backupPageQuery({ id: 23, url: `${domestic}/canvas/projects` }), "from=projects");
});
