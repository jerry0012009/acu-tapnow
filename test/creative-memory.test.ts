import test from "node:test";
import assert from "node:assert/strict";
import { parseCreativeMemory, creativeMemoryMarkup } from "../utils/creative-memory";

test("empty, disabled, unavailable and invalid recall never creates a visible section", () => {
  for (const value of [null, {}, { status: "no_match" }, { status: "disabled" }, { status: "unavailable" }, { status: "ready", references: [{ id: "x", quote: "" }] }]) {
    assert.equal(creativeMemoryMarkup(parseCreativeMemory(value)), "");
  }
});

test("adopted evidence preserves server order, shows only first five and escapes source content", () => {
  const memory = parseCreativeMemory({ status: "ready", supplement: "真实依据", references: ["third", "first", "second", "fourth", "fifth", "sixth"].map(id => ({ id, name: id, quote: `<script>${id}</script>`, application: "本次应用", scope: "personal" })) });
  assert.deepEqual(memory.references.map(ref => ref.id), ["third", "first", "second", "fourth", "fifth", "sixth"]);
  const html = creativeMemoryMarkup(memory);
  assert.equal((html.match(/<li>/g) || []).length, 5);
  assert(html.indexOf("third") < html.indexOf("first"));
  assert(!html.includes("sixth"));
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes(" open"));
});
