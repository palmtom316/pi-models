import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteModels, deleteProvider, listExistingProviders } from "../src/models-json.ts";
import type { ModelsFile } from "../src/types.ts";

const file: ModelsFile = {
  providers: {
    QQ: {
      apiKey: "sk-qq",
      api: "openai-completions",
      baseUrl: "https://new-api.abrdns.com/v1",
      models: [
        { id: "GLM-5.2-think", api: "openai-completions", baseUrl: "https://new-api.abrdns.com/v1" },
        { id: "gpt-5.6-sol", api: "openai-completions", baseUrl: "https://new-api.abrdns.com/v1" },
      ],
    },
    RELAY: {
      apiKey: "sk-relay",
      api: "openai-completions",
      baseUrl: "https://relay.example/v1",
      models: [
        { id: "claude-opus-5", api: "openai-completions", baseUrl: "https://relay.example/v1" },
      ],
    },
  },
};

describe("view existing providers", () => {
  it("lists all providers with model counts", () => {
    const names = listExistingProviders(file);
    assert.deepEqual(names, ["QQ", "RELAY"]);
    assert.equal(file.providers.QQ?.models?.length, 2);
    assert.equal(file.providers.RELAY?.models?.length, 1);
  });

  it("deletes a provider and its models", () => {
    const next = deleteProvider(file, "RELAY");
    assert.equal(next.providers.RELAY, undefined);
    assert.deepEqual(listExistingProviders(next), ["QQ"]);
    assert.equal(next.providers.QQ?.models?.length, 2);
  });

  it("deletes selected models from a provider", () => {
    const next = deleteModels(file, "QQ", ["gpt-5.6-sol"]);
    assert.equal(next.providers.QQ?.models?.length, 1);
    assert.equal(next.providers.QQ?.models?.[0]?.id, "GLM-5.2-think");
  });

  it("deleteProvider on non-existent provider is a no-op", () => {
    const next = deleteProvider(file, "NONEXIST");
    assert.deepEqual(listExistingProviders(next), ["QQ", "RELAY"]);
  });

  it("deleteModels on non-existent provider is a no-op", () => {
    const next = deleteModels(file, "NONEXIST", ["whatever"]);
    assert.deepEqual(next, file);
  });
});
