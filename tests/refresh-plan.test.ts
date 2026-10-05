import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRefresh, providerEndpoints, refreshAdds } from "../src/refresh-plan.ts";
import type { ModelDraft, ModelRecord, ProviderRecord } from "../src/types.ts";

function model(id: string, extra?: Partial<ModelRecord>): ModelRecord {
  return { id, api: "openai-completions", baseUrl: "https://relay.example/v1", ...extra };
}

function draft(id: string): ModelDraft {
  return {
    id,
    name: id,
    api: "openai-completions",
    baseUrl: "https://relay.example/v1",
    reasoning: false,
    input: ["text"],
    contextWindow: 8,
    maxTokens: 8,
    match: { kind: "unknown" },
  };
}

describe("refresh plan", () => {
  const provider: ProviderRecord = {
    api: "openai-completions",
    baseUrl: "https://relay.example/v1",
    models: [
      model("keep"),
      model("gone"),
      model("other-api", { api: "anthropic-messages", baseUrl: "https://relay.example" }),
    ],
  };

  it("lists each stored endpoint once, including provider-level defaults", () => {
    assert.deepEqual(providerEndpoints(provider), [
      { api: "openai-completions", baseUrl: "https://relay.example/v1" },
      { api: "anthropic-messages", baseUrl: "https://relay.example" },
    ]);
    assert.deepEqual(providerEndpoints({ api: "openai-responses", baseUrl: "https://only.example/v1" }), [
      { api: "openai-responses", baseUrl: "https://only.example/v1" },
    ]);
    assert.deepEqual(providerEndpoints(undefined), []);
  });

  it("offers catalog-only ids to add and stored-only ids of that endpoint to remove", () => {
    const plan = planRefresh(provider, { api: "openai-completions", baseUrl: "https://relay.example/v1" }, [
      "keep",
      "fresh",
    ]);
    assert.deepEqual(plan.addable, ["fresh"]);
    assert.deepEqual(plan.removable.map((item) => item.id), ["gone"]);
    assert.deepEqual(plan.kept.map((item) => item.id), ["keep"]);
  });

  it("does not treat another endpoint's models as part of this refresh", () => {
    const plan = planRefresh(provider, { api: "anthropic-messages", baseUrl: "https://relay.example" }, ["other-api"]);
    assert.deepEqual(plan.addable, []);
    assert.deepEqual(plan.removable, []);
  });

  it("keeps only selected drafts that the plan marked addable", () => {
    const plan = planRefresh(provider, { api: "openai-completions", baseUrl: "https://relay.example/v1" }, ["fresh", "keep"]);
    const picked = refreshAdds(plan, ["fresh", "keep"], [draft("fresh"), draft("keep"), draft("gone")]);
    assert.deepEqual(picked.map((item) => item.id), ["fresh"]);
  });
});
