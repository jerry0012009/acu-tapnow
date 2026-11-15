import test from "node:test";
import assert from "node:assert/strict";
import { isVideoMaterial, prepareVideoMaterials, videoDraftIdentity } from "../utils/video";
import { llmInternals } from "../utils/llm";
import type { ReviewDraft } from "../utils/reviewer";

const draft = (): ReviewDraft => ({ prompt: "评价参考视频的光线和动作", videoMaterials: [
  { materialId: "video-1", url: "https://files.tapnow.media/fixture.mov", sourceNodeId: "video-node", role: "upstream-video-reference" }
] });
test("MOV recognition ignores signed query and accepts video node without suffix", () => {
  assert(isVideoMaterial("https://files.tapnow.media/a.MOV?sig=fixture"));
  assert(isVideoMaterial("https://files.tapnow.media/asset", "video"));
  assert(!isVideoMaterial("https://files.tapnow.media/a.png"));
});
test("native frames preserve source identity and timestamps in both protocols", async () => {
  const input = draft();
  const prepared = await prepareVideoMaterials(input, { getManifest: () => ({ version: "0.1.23" }), sendNativeMessage: async (host, message: any) => {
    assert.equal(host, "com.acucompute.tapnow");
    assert.equal(message.action, "video-frames");
    assert.equal(message.url, input.videoMaterials![0]!.url);
    assert(!("apiKey" in message));
    return { ok: true, omitted: 2, content: [{ type: "text", text: "### Frame at 00:00:03" }, { type: "image", data: "aGVsbG8=", mimeType: "image/jpeg" }] };
  } });
  assert.equal(videoDraftIdentity(input), videoDraftIdentity(prepared));
  assert.equal(input.videoMaterials![0]!.frames, undefined);
  const compact = JSON.parse(llmInternals.compactDraft(prepared));
  assert.equal(compact.video_materials[0].audio_analyzed, false);
  assert.deepEqual(compact.video_materials[0].sampled_timestamps, ["00:00:03"]);
  assert.equal(compact.video_materials[0].omitted_frames, 2);
  assert.equal(llmInternals.responseInput(prepared, true)[0]!.content.filter(p => p.type === "input_image").length, 1);
  assert.equal(llmInternals.userContent(prepared, true).filter(p => p.type === "image_url").length, 1);
  assert.equal(llmInternals.responseInput(prepared, false)[0]!.content.filter(p => p.type === "input_image").length, 0);
  const disabled = llmInternals.responseInput(prepared, false)[0]!.content[0]!;
  assert.deepEqual(JSON.parse(disabled.text!).video_materials[0].sent_frames, []);
});
test("native errors are explicit; hostile sources never reach the native host", async () => {
  let calls = 0;
  const runtime = { getManifest: () => ({ version: "0.1.23" }), sendNativeMessage: async () => { calls++; throw Error("Runtime unavailable"); } };
  const failed = await prepareVideoMaterials(draft(), runtime);
  assert.match(failed.videoMaterials![0]!.error!, /unavailable/);
  const input = draft(); input.videoMaterials![0]!.url = "https://files.tapnow.media.evil.test/fixture.mov";
  const refused = await prepareVideoMaterials(input, runtime);
  assert.equal(calls, 1);
  assert.match(refused.videoMaterials![0]!.error!, /域名/);
});
test("result video identity changes invalidate stale advice", () => {
  const input = draft(), changed = draft();
  changed.videoMaterials![0]!.url = "https://files.tapnow.media/new.mov";
  assert.notEqual(videoDraftIdentity(input), videoDraftIdentity(changed));
});
