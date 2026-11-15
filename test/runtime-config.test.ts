import test from "node:test";
import assert from "node:assert/strict";
import { parseRuntimeConfig } from "../utils/runtime-config";

const fixture = () => ({ kind: "acu-tapnow-companion", schema: 1, apiKey: "sk-isolated-test-key", settings: {
  llmBaseUrl: "https://api.acucompute.com/v1", llmProtocol: "responses", llmModel: "acu-auto"
} });

test("Runtime import accepts only the versioned ACU contract and strips extra fields", () => {
  const input = { ...fixture(), unrelated: "ignore", settings: { ...fixture().settings, forbiddenTerms: ["must not replace"] } };
  assert.deepEqual(parseRuntimeConfig(JSON.stringify(input)), fixture());
});

test("Runtime import rejects hostile URLs, protocols, invalid keys and models without echoing secrets", () => {
  for (const field of ["https://evil.invalid/v1", "https://api.acucompute.com.evil.invalid/v1", "http://api.acucompute.com/v1"]) {
    assert.throws(() => parseRuntimeConfig(JSON.stringify({ ...fixture(), settings: { ...fixture().settings, llmBaseUrl: field } })));
  }
  for (const change of [{ schema: 2 }, { apiKey: "" }, { apiKey: "sk-secret\nheader" }, { settings: null }, { settings: { ...fixture().settings, llmModel: "<script>" } }, { settings: { ...fixture().settings, llmProtocol: "javascript" } }]) {
    assert.throws(() => parseRuntimeConfig(JSON.stringify({ ...fixture(), ...change })), error => !String(error).includes("sk-secret"));
  }
  for (const input of ["null", "not-json", " ".repeat(16385)]) assert.throws(() => parseRuntimeConfig(input));
});
