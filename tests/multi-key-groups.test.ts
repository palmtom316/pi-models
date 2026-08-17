import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDrafts, listExistingProviders } from "../src/models-json.ts";
import type { ModelDraft, ModelsFile } from "../src/types.ts";

function draft(partial: Partial<ModelDraft> & Pick<ModelDraft, "id" | "api" | "baseUrl">): ModelDraft {
  return {
    name: partial.name ?? partial.id,
    reasoning: true,
    input: ["text"],
    contextWindow: 1000,
    maxTokens: 100,
    match: { kind: "unmatched" },
    ...partial,
  };
}

describe("multi-key provider groups", () => {
  it("writes same-URL different-key groups as separate providers", () => {
    const baseUrl = "https://relay.example/v1";
    const file: ModelsFile = { providers: {} };

    // Group 1: key A → models gpt-5.6-sol
    const r1 = applyDrafts(file, {
      providerId: "RELAY",
      mode: "merge",
      apiKey: "sk-keyA",
      drafts: [draft({ id: "gpt-5.6-sol", api: "openai-completions", baseUrl })],
    });
    // Group 2: key B → models claude-opus-5 (same URL, different key)
    const r2 = applyDrafts(r1.file, {
      providerId: "RELAY-2",
      mode: "merge",
      apiKey: "sk-keyB",
      drafts: [draft({ id: "claude-opus-5", api: "openai-completions", baseUrl })],
    });

    const names = listExistingProviders(r2.file);
    assert.deepEqual(names, ["RELAY", "RELAY-2"]);
    assert.equal(r2.file.providers["RELAY"]?.apiKey, "sk-keyA");
    assert.equal(r2.file.providers["RELAY-2"]?.apiKey, "sk-keyB");

    // Both providers have the same baseUrl but different models
    const m1 = r2.file.providers["RELAY"]?.models ?? [];
    const m2 = r2.file.providers["RELAY-2"]?.models ?? [];
    assert.equal(m1[0]?.id, "gpt-5.6-sol");
    assert.equal(m2[0]?.id, "claude-opus-5");
    assert.equal(m1[0]?.baseUrl, baseUrl);
    assert.equal(m2[0]?.baseUrl, baseUrl);
  });

  it("same id across two groups in the same provider does not silently overwrite", () => {
    const baseUrl = "https://relay.example/v1";
    const file: ModelsFile = { providers: {} };

    const r1 = applyDrafts(file, {
      providerId: "RELAY",
      mode: "merge",
      apiKey: "sk-keyA",
      drafts: [draft({ id: "shared-model", api: "openai-completions", baseUrl })],
    });
    // Adding same id to RELAY-2 is fine (different provider)
    const r2 = applyDrafts(r1.file, {
      providerId: "RELAY-2",
      mode: "merge",
      apiKey: "sk-keyB",
      drafts: [draft({ id: "shared-model", api: "openai-completions", baseUrl })],
    });
    assert.equal(r2.file.providers["RELAY"]?.models?.[0]?.id, "shared-model");
    assert.equal(r2.file.providers["RELAY-2"]?.models?.[0]?.id, "shared-model");
    assert.equal(r2.added, 1);
  });
});
