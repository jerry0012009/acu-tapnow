import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, createPublicKey } from "node:crypto";

test("ZIP manifest keys produce the fixed Runtime identities without store registration", () => {
  const identities = JSON.parse(readFileSync("extension-identities.json", "utf8"));
  for (const edition of ["companion", "backup"]) {
    const { key, id } = identities[edition];
    const bytes = Buffer.from(key, "base64");
    createPublicKey({ key: bytes, type: "spki", format: "der" });
    const derived = [...createHash("sha256").update(bytes).digest("hex").slice(0, 32)]
      .map(c => String.fromCharCode(97 + parseInt(c, 16))).join("");
    assert.equal(derived, id);
  }
  assert.notEqual(identities.companion.id, identities.backup.id);
});
