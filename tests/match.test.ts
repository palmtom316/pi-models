import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { extractOfficial } from "../src/models-dev.ts";
import { matchOfficial, normalizeForMatch } from "../src/match.ts";
import type { OfficialCatalog } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const snippet = JSON.parse(readFileSync(join(here, "fixtures/official-snippet.json"), "utf8"));
const catalog = extractOfficial(snippet) as OfficialCatalog;

describe("normalizeForMatch", () => {
  it("strips vendor prefix and build suffix", () => {
    assert.equal(normalizeForMatch("deepseek-ai/deepseek-v4-flash-0731"), "deepseek-v4-flash");
    assert.equal(normalizeForMatch("DeepSeek-V4-Flash-think"), "deepseek-v4-flash");
    assert.equal(normalizeForMatch("GLM-5.2-think"), "glm-5.2");
  });
});

describe("matchOfficial", () => {
  it("maps WONG-style deepseek id to official flash", () => {
    const hit = matchOfficial("deepseek-ai/deepseek-v4-flash-0731", catalog);
    assert.equal(hit.kind, "official");
    assert.equal(hit.bucket, "deepseek");
    assert.equal(hit.officialId, "deepseek-v4-flash");
  });

  it("keeps the semantic -reasoner suffix for exact official ids", () => {
    const hit = matchOfficial("deepseek-reasoner", catalog);
    assert.equal(hit.kind, "official");
    assert.equal(hit.officialId, "deepseek-reasoner");
  });

  it("does not treat reseller 0731 as an official id", () => {
    assert.equal(catalog.deepseek?.models["deepseek-v4-flash-0731"], undefined);
    assert.ok(snippet.openrouter?.models["deepseek/deepseek-v4-flash-0731"]);
    const hit = matchOfficial("deepseek/deepseek-v4-flash-0731", catalog);
    assert.equal(hit.officialId, "deepseek-v4-flash");
    assert.notEqual(hit.bucket, "openrouter");
  });

  it("does not auto-pick latest gpt-5.6 for gpt-5", () => {
    const hit = matchOfficial("gpt-5", catalog);
    assert.notEqual(hit.officialId, "gpt-5.6-sol");
  });

  it("hits official claude / gemini / kimi / glm / grok", () => {
    assert.equal(matchOfficial("claude-opus-5", catalog).officialId, "claude-opus-5");
    assert.equal(matchOfficial("gemini-3.7-flash", catalog).officialId, "gemini-3.7-flash");
    assert.equal(matchOfficial("kimi-k3", catalog).officialId, "kimi-k3");
    assert.equal(matchOfficial("glm-5.2", catalog).bucket, "zhipuai");
    assert.equal(matchOfficial("grok-4.6", catalog).officialId, "grok-4.6");
  });
});
