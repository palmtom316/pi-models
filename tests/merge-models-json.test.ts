import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { applyDrafts, clashesBuiltin, deleteModels, deleteProvider, providerNameOk, replaceModelRecords, sanitizeFile, sinkThinkingCompat, writeModelsFile, writeProviderBackup } from "../src/models-json.ts";
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

const elyBefore: ModelsFile = {
  providers: {
    ELY: {
      name: "ELY",
      api: "openai-completions",
      baseUrl: "https://elysiver.h-e.top/v1",
      apiKey: "sk-test",
      compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "deepseek",
        requiresReasoningContentOnAssistantMessages: true,
      },
      models: [
        {
          id: "deepseek-v4-flash-0731",
          name: "DeepSeek",
          reasoning: true,
          contextWindow: 1_000_000,
          maxTokens: 384_000,
          cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0.14 },
        },
      ],
    },
  },
};

describe("applyDrafts multi-api", () => {
  it("sinks provider thinkingFormat before adding claude", () => {
    const result = applyDrafts(elyBefore, {
      providerId: "ELY",
      mode: "merge",
      drafts: [
        draft({
          id: "claude-opus-5",
          api: "anthropic-messages",
          baseUrl: "https://elysiver.h-e.top",
          compat: { forceAdaptiveThinking: true },
        }),
      ],
    });
    assert.equal(result.sunkThinking, true);
    const p = result.file.providers.ELY;
    assert.equal(p.compat?.thinkingFormat, undefined);
    const ds = p.models?.find((m) => m.id === "deepseek-v4-flash-0731");
    const claude = p.models?.find((m) => m.id === "claude-opus-5");
    assert.equal(ds?.compat?.thinkingFormat, "deepseek");
    assert.equal(ds?.cost?.input, 0.14);
    assert.equal(claude?.compat?.forceAdaptiveThinking, true);
    assert.equal(claude?.compat?.thinkingFormat, undefined);
    assert.equal(claude?.api, "anthropic-messages");
    assert.equal(ds?.api, "openai-completions");
    assert.equal(ds?.baseUrl, "https://elysiver.h-e.top/v1");
    assert.equal(p.api, undefined);
    assert.equal(p.baseUrl, undefined);
  });

  it("does not silently overwrite same id on merge", () => {
    const result = applyDrafts(elyBefore, {
      providerId: "ELY",
      mode: "merge",
      drafts: [draft({ id: "deepseek-v4-flash-0731", api: "anthropic-messages", baseUrl: "https://elysiver.h-e.top" })],
    });
    assert.deepEqual(result.skippedConflicts, ["deepseek-v4-flash-0731"]);
    const kept = result.file.providers.ELY.models?.[0];
    assert.notEqual(kept?.api, "anthropic-messages");
  });

  it("replaceExisting overwrites the id but keeps cost", () => {
    const result = applyDrafts(elyBefore, {
      providerId: "ELY",
      mode: "merge",
      drafts: [
        draft({
          id: "deepseek-v4-flash-0731",
          api: "openai-completions",
          baseUrl: "https://elysiver.h-e.top/v1",
          replaceExisting: true,
          contextWindow: 12,
        }),
      ],
    });
    const kept = result.file.providers.ELY.models?.[0];
    assert.equal(kept?.contextWindow, 12);
    assert.equal(kept?.cost?.input, 0.14);
  });

  it("strips unknown fields", () => {
    const dirty = sanitizeFile({
      providers: {
        X: {
          name: "X",
          models: [{ id: "a", _hub: "nope", api: "openai-completions", baseUrl: "https://x/v1" } as never],
        },
      },
    });
    assert.equal("_hub" in (dirty.providers.X.models?.[0] ?? {}), false);
  });
});

describe("sinkThinkingCompat", () => {
  it("copies provider keys onto openai models only", () => {
    const next = sinkThinkingCompat({
      api: "openai-completions",
      compat: { thinkingFormat: "deepseek", requiresReasoningContentOnAssistantMessages: true },
      models: [
        { id: "ds" },
        { id: "claude", api: "anthropic-messages" },
      ],
    });
    assert.equal(next.compat?.thinkingFormat, undefined);
    assert.equal(next.models?.[0]?.compat?.thinkingFormat, "deepseek");
    assert.equal(next.models?.[1]?.compat?.thinkingFormat, undefined);
  });
});

describe("names", () => {
  it("accepts ELY and rejects spaces / builtin clash", () => {
    assert.equal(providerNameOk("ELY"), true);
    assert.equal(providerNameOk("my provider"), false);
    assert.equal(clashesBuiltin("openai"), true);
    assert.equal(clashesBuiltin("cc-switch-claude"), true);
    assert.equal(clashesBuiltin("ELY"), false);
  });
});

describe("delete provider / models", () => {
  it("removes a whole provider", () => {
    const next = deleteProvider(elyBefore, "ELY");
    assert.equal(next.providers.ELY, undefined);
  });

  it("removes selected models only", () => {
    const withTwo = applyDrafts(elyBefore, {
      providerId: "ELY",
      mode: "merge",
      drafts: [draft({ id: "claude-opus-5", api: "anthropic-messages", baseUrl: "https://elysiver.h-e.top" })],
    }).file;
    const next = deleteModels(withTwo, "ELY", ["claude-opus-5"]);
    const ids = next.providers.ELY.models?.map((m) => m.id);
    assert.deepEqual(ids, ["deepseek-v4-flash-0731"]);
  });

  it("updates caps but keeps id and cost", () => {
    const next = replaceModelRecords(elyBefore, "ELY", [
      {
        id: "deepseek-v4-flash-0731",
        name: "DS Flash",
        contextWindow: 999,
        maxTokens: 111,
      },
    ]);
    const model = next.providers.ELY.models?.[0];
    assert.equal(model?.id, "deepseek-v4-flash-0731");
    assert.equal(model?.name, "DS Flash");
    assert.equal(model?.contextWindow, 999);
    assert.equal(model?.cost?.input, 0.14);
  });
});

describe("writeProviderBackup", () => {
  it("writes a 0600 provider snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hub-models-"));
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    const path = await writeProviderBackup(elyBefore, "ELY");
    const body = JSON.parse(await readFile(path, "utf8"));
    assert.ok(body.providers.ELY);
    const { stat } = await import("node:fs/promises");
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  });
});

describe("writeModelsFile", () => {
  it("backs up and writes 0600", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hub-models-"));
    const path = join(dir, "models.json");
    await writeFile(path, JSON.stringify(elyBefore));
    const { backupPath } = await writeModelsFile({ providers: { Z: { name: "Z", models: [] } } }, path);
    assert.ok(backupPath);
    const written = JSON.parse(await readFile(path, "utf8"));
    assert.ok(written.providers.Z);
    const { stat } = await import("node:fs/promises");
    const mode = (await stat(path)).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});
