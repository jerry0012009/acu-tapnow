import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAcuEndpoint } from "../utils/acu-endpoint";
import { parseRuntimeConfig } from "../utils/runtime-config";
import { llmInternals } from "../utils/llm";

test("official logged-in Runtime sources are accepted without changing origins", () => {
  for (const [raw, expected] of [
    ["https://console.acucompute.com/v1", "https://console.acucompute.com/v1"],
    ["https://acucompute.com/v1/", "https://acucompute.com/v1"],
    ["https://api.acu.best/acu/v1", "https://api.acu.best/acu/v1"],
    ["https://acu.best/", "https://acu.best/v1"],
    ["https://API.ACUCOMPUTE.COM:443/v1/", "https://api.acucompute.com/v1"],
  ]) {
    assert.equal(normalizeAcuEndpoint(raw), expected);
    const input = {kind:"acu-tapnow-companion",schema:1,apiKey:"sk-fixture-only-key",settings:{llmBaseUrl:raw,llmProtocol:"responses",llmModel:"gpt-6.1-sol"}};
    assert.equal(parseRuntimeConfig(JSON.stringify(input)).settings.llmBaseUrl,expected);
    assert.doesNotThrow(()=>llmInternals.assertOpenAiUrl(raw));
  }
});

test("lookalike domains, unsafe URL parts and arbitrary paths remain rejected", () => {
  for (const raw of ["https://console.acucompute.com.evil/v1","https://evilacu.best/v1","http://console.acucompute.com/v1","https://user@console.acucompute.com/v1","https://console.acucompute.com:8443/v1","https://console.acucompute.com/v1?key=secret","https://console.acucompute.com/v1#secret","https://console.acucompute.com/other"]) {
    assert.throws(()=>normalizeAcuEndpoint(raw));
    assert.throws(()=>llmInternals.assertOpenAiUrl(raw));
  }
});
