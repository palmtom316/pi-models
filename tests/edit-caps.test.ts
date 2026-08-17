import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDrafts } from "../src/resolve.ts";
import { recordToDraft, resetDraftCaps } from "../src/caps.ts";

describe("resetDraftCaps", () => {
  it("restores builtin flash caps without renaming the relay id", () => {
    const { drafts } = resolveDrafts(
      [{ id: "deepseek-ai/deepseek-v4-flash-0731" }],
      "openai-completions",
      "https://x/v1",
    );
    const dirty = {
      ...drafts[0]!,
      contextWindow: 12,
      maxTokens: 3,
      thinkingLevelMap: { off: null, high: "high" },
    };
    const reset = resetDraftCaps(dirty);
    assert.equal(reset.id, "deepseek-ai/deepseek-v4-flash-0731");
    assert.equal(reset.contextWindow, 1_000_000);
    assert.equal(reset.maxTokens, 384_000);
    assert.equal(reset.thinkingLevelMap?.low, "low");
    assert.equal(reset.match.officialId, "deepseek-v4-flash");
  });

  it("round-trips an existing models.json row through recordToDraft", () => {
    const draft = recordToDraft(
      {
        id: "glm-5.3",
        name: "GLM",
        api: "openai-completions",
        baseUrl: "https://x/v1",
        reasoning: true,
        contextWindow: 1_000_000,
        maxTokens: 131_072,
      },
      { name: "ELY" },
    );
    assert.equal(draft.match.officialId, "glm-5.3");
    const reset = resetDraftCaps(draft);
    assert.equal(reset.thinkingLevelMap?.low, "low");
    assert.equal(reset.thinkingLevelMap?.off, null);
  });
});
