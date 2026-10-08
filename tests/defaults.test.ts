import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heuristicCaps, officialInput } from "../src/defaults.ts";
import { resetDraftCaps, recordToDraft } from "../src/caps.ts";
import { matchBuiltin, resolveDrafts } from "../src/resolve.ts";
import { normalizeForMatch } from "../src/match.ts";

describe("heuristicCaps input modality", () => {
  it("assumes vision for deepseek v4 ids instead of text-only", () => {
    const flash = heuristicCaps("deepseek-v4.1-flash");
    assert.deepEqual(flash.input, ["text", "image"]);
    assert.deepEqual(heuristicCaps("deepseek-ai/DeepSeek-V4.1-Flash").input, ["text", "image"]);
    assert.deepEqual(heuristicCaps("deepseek-flash").input, ["text", "image"]);
    assert.deepEqual(heuristicCaps("deepseek-v4-flash-vision-exp").input, ["text", "image"]);
    assert.equal(flash.contextWindow, 1_000_000);
    assert.equal(flash.maxTokens, 384_000);
  });

  it("assumes vision for glm-5.3 ids", () => {
    assert.deepEqual(heuristicCaps("glm-5.3-flash").input, ["text", "image"]);
    assert.deepEqual(heuristicCaps("z-ai/glm-5.3-flashx").input, ["text", "image"]);
  });

  it("assumes vision for legacy glm vision variants", () => {
    assert.deepEqual(heuristicCaps("glm-5v-turbo").input, ["text", "image"]);
    assert.deepEqual(heuristicCaps("glm-4.6v").input, ["text", "image"]);
  });

  it("keeps the conservative text-only default for unknown families", () => {
    assert.deepEqual(heuristicCaps("some-unknown-model").input, ["text"]);
  });

  it("only falls back when the official entry has no modalities", () => {
    assert.deepEqual(officialInput(undefined, ["text", "image"]), ["text", "image"]);
    assert.deepEqual(officialInput({ id: "x", modalities: { input: ["text"] } }, ["text", "image"]), ["text"]);
    assert.deepEqual(officialInput({ id: "x", modalities: { input: ["text", "image"] } }), ["text", "image"]);
  });
});

describe("deepseek-v4.1-flash resolves through the builtin table", () => {
  it("normalizes dotted and dashed relay ids onto deepseek-v4-flash", () => {
    assert.equal(normalizeForMatch("deepseek-v4.1-flash"), "deepseek-v4-flash");
    assert.equal(normalizeForMatch("deepseek-v4-1-flash"), "deepseek-v4-flash");
    assert.equal(normalizeForMatch("deepseek-ai/DeepSeek-V4.1-Flash"), "deepseek-v4-flash");
    // Dotted ids that are not builtin stay untouched, so models.dev keys keep matching.
    assert.equal(normalizeForMatch("gpt-5.6"), "gpt-5.6");
  });

  it("matches the builtin flash entry for every relay spelling", () => {
    for (const id of [
      "deepseek-v4.1-flash",
      "deepseek-v4-1-flash",
      "deepseek-ai/deepseek-v4.1-flash",
      "deepseek-v4-flash",
    ]) {
      const hit = matchBuiltin(id);
      assert.equal(hit.kind, "official", id);
      assert.equal(hit.officialId, "deepseek-v4-flash", id);
      assert.deepEqual(hit.official?.modalities?.input, ["text", "image", "pdf"], id);
    }
    // These two are the official V4.1 name and the legacy vision id; each has its
    // own catalog row and still exposes image input.
    for (const id of ["deepseek-flash", "deepseek-v4-flash-vision-exp"]) {
      const hit = matchBuiltin(id);
      assert.equal(hit.officialId, id);
      assert.deepEqual(hit.official?.modalities?.input, ["text", "image", "pdf"], id);
    }
  });

  it("keeps deepseek-v4-pro text-only in the builtin table", () => {
    const hit = matchBuiltin("deepseek-v4-pro");
    assert.equal(hit.officialId, "deepseek-v4-pro");
    assert.deepEqual(hit.official?.modalities?.input, ["text"]);
  });

  it("gives relay rows image input without renaming the upstream id", () => {
    const { drafts, unknownIds } = resolveDrafts(
      [{ id: "deepseek-v4.1-flash" }, { id: "deepseek-ai/deepseek-v4.1-flash" }],
      "openai-completions",
      "https://wzw.pp.ua/v1",
    );
    assert.deepEqual(unknownIds, []);
    for (const draft of drafts) {
      assert.equal(draft.input.includes("image"), true, draft.id);
      assert.equal(draft.match.officialId, "deepseek-v4-flash");
      assert.equal(draft.contextWindow, 1_000_000);
      assert.equal(draft.maxTokens, 384_000);
    }
    assert.deepEqual(drafts.map((d) => d.id), ["deepseek-v4.1-flash", "deepseek-ai/deepseek-v4.1-flash"]);
  });

  it("adds glm-5.3-flash as a multimodal builtin row", () => {
    const hit = matchBuiltin("z-ai/glm-5.3-flash");
    assert.equal(hit.kind, "official");
    assert.equal(hit.officialId, "glm-5.3-flash");
    assert.deepEqual(hit.official?.modalities?.input, ["text", "image", "video", "pdf"]);
  });
});

describe("resetDraftCaps keeps vision after the fix", () => {
  it("restores image input for a deepseek-v4.1-flash row", () => {
    const draft = recordToDraft(
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash",
        api: "openai-completions",
        baseUrl: "https://wzw.pp.ua/v1",
        reasoning: true,
        input: ["text"],
        contextWindow: 1_000_000,
        maxTokens: 384_000,
      },
      { name: "WONG" },
    );
    const reset = resetDraftCaps(draft);
    assert.equal(reset.input.includes("image"), true);
    assert.equal(reset.match.officialId, "deepseek-v4-flash");
    assert.equal(reset.thinkingLevelMap?.low, "low");
    assert.equal(reset.thinkingLevelMap?.off, "disabled");
  });
});