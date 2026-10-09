import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Model, Provider } from "@earendil-works/pi-ai";
import {
  applyInputBackfill,
  backfilledInput,
  describeChanges,
  needsInputBackfill,
  persistInputBackfill,
  planInputBackfill,
  wrapForInputBackfill,
  type InputBackfillRegistry,
} from "../src/caps-backfill.ts";
import { getModelsJsonPath } from "../src/paths.ts";
import type { ModelsFile } from "../src/types.ts";

function model(id: string, input?: Array<"text" | "image">): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "ELY",
    baseUrl: "https://relay.example/v1",
    reasoning: true,
    ...(input ? { input } : {}),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
  };
}

function provider(id: string, models: Model<"openai-completions">[]): Provider {
  return {
    id,
    name: id,
    auth: {},
    getModels: () => models,
    stream: () => {
      throw new Error("unused");
    },
    streamSimple: () => {
      throw new Error("unused");
    },
  };
}

function file(models: Record<string, Array<{ id: string; input?: Array<"text" | "image"> }>>): ModelsFile {
  const providers: ModelsFile["providers"] = {};
  for (const [providerId, list] of Object.entries(models)) {
    providers[providerId] = {
      name: providerId,
      api: "openai-completions",
      baseUrl: "https://relay.example/v1",
      models: list.map((entry) => ({ ...entry, name: entry.id })),
    };
  }
  return { providers };
}

async function withAgentDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pim-backfill-"));
  const prev = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  }
}

describe("backfilledInput", () => {
  it("upgrades a stale builtin deepseek flash entry to text+image", () => {
    assert.deepEqual(backfilledInput("deepseek-v4.1-flash", ["text"]), ["text", "image"]);
    assert.deepEqual(backfilledInput("deepseek-v4-flash", ["text"]), ["text", "image"]);
    assert.deepEqual(backfilledInput("deepseek-flash", undefined), ["text", "image"]);
  });

  it("follows the alias rewrite for dotted and prefixed relay ids", () => {
    // deepseek-v4.1-flash / deepseek-v4-1-flash / vendor-prefixed all route to
    // builtin deepseek-v4-flash, which the catalog marks multimodal.
    assert.deepEqual(backfilledInput("deepseek-ai/DeepSeek-V4.1-Flash", ["text"]), ["text", "image"]);
    assert.deepEqual(backfilledInput("deepseek-v4.1-flash-次", ["text"]), ["text", "image"]);
  });

  it("never touches a catalog model that is text-only", () => {
    assert.equal(backfilledInput("deepseek-v4-pro", ["text"]), undefined);
    assert.equal(backfilledInput("glm-5.3", ["text"]), undefined);
    assert.equal(backfilledInput("glm-5.2", ["text"]), undefined);
  });

  it("ignores ids the builtin catalog does not know", () => {
    assert.equal(backfilledInput("some-relay-only-model", ["text"]), undefined);
    assert.equal(backfilledInput("grok-9-preview", []), undefined);
  });

  it("is one-way: an entry that already has image is never rewritten", () => {
    assert.equal(backfilledInput("deepseek-v4.1-flash", ["text", "image"]), undefined);
    assert.equal(backfilledInput("deepseek-v4.1-flash", ["image"]), undefined);
  });
});

describe("planInputBackfill", () => {
  it("upgrades only stale models and reports provider/id detail", () => {
    const before = file({
      xjm: [{ id: "deepseek-v4.1-flash", input: ["text"] }, { id: "gpt-6-astra", input: ["text", "image"] }],
      hyb: [{ id: "deepseek-v4.1-flash", input: ["text"] }],
    });
    const { file: after, changes } = planInputBackfill(before);
    assert.deepEqual(after.providers.xjm?.models?.[0]?.input, ["text", "image"]);
    assert.deepEqual(after.providers.xjm?.models?.[1]?.input, ["text", "image"]);
    assert.deepEqual(after.providers.hyb?.models?.[0]?.input, ["text", "image"]);
    assert.deepEqual(
      changes.map((change) => `${change.provider}/${change.id}`),
      ["xjm/deepseek-v4.1-flash", "hyb/deepseek-v4.1-flash"],
    );
    assert.deepEqual(changes[0]?.from, ["text"]);
  });

  it("does not mutate the input file", () => {
    const before = file({ xjm: [{ id: "deepseek-v4.1-flash", input: ["text"] }] });
    planInputBackfill(before);
    assert.deepEqual(before.providers.xjm?.models?.[0]?.input, ["text"]);
  });

  it("returns untouched providers by reference and reports no changes when clean", () => {
    const before = file({
      ok: [{ id: "deepseek-v4.1-flash", input: ["text", "image"] }],
      unknown: [{ id: "mystery-model", input: ["text"] }],
    });
    const { file: after, changes } = planInputBackfill(before);
    assert.equal(changes.length, 0);
    assert.equal(after.providers.ok, before.providers.ok);
    assert.equal(after.providers.unknown, before.providers.unknown);
  });

  it("respects an explicit input pin in modelOverrides", () => {
    const before = file({ xjm: [{ id: "deepseek-v4.1-flash", input: ["text"] }] });
    before.providers.xjm!.modelOverrides = { "deepseek-v4.1-flash": { input: ["text"] } };
    const { changes } = planInputBackfill(before);
    assert.equal(changes.length, 0);
  });
});

describe("describeChanges", () => {
  it("lists labels and elides the tail", () => {
    const changes = [
      { provider: "xjm", id: "deepseek-v4.1-flash", to: ["text", "image"] as Array<"text" | "image"> },
      { provider: "hyb", id: "deepseek-v4.1-flash", to: ["text", "image"] as Array<"text" | "image"> },
    ];
    assert.equal(describeChanges(changes), "xjm/deepseek-v4.1-flash, hyb/deepseek-v4.1-flash");
    const many = [...changes, ...changes.map((c) => ({ ...c, provider: `p${c.provider}` }))];
    assert.equal(describeChanges(many, 2), "xjm/deepseek-v4.1-flash, hyb/deepseek-v4.1-flash +2");
  });
});

describe("registry patch", () => {
  it("detects and upgrades stale model lists without touching clean ones", () => {
    const stale = [model("deepseek-v4.1-flash", ["text"]), model("gpt-6-astra", ["text", "image"])];
    assert.equal(needsInputBackfill(stale), true);
    const patched = wrapForInputBackfill(provider("xjm", stale)).getModels();
    assert.deepEqual(patched[0]?.input, ["text", "image"]);
    assert.deepEqual(patched[1]?.input, ["text", "image"]);

    const clean = [model("deepseek-v4.1-flash", ["text", "image"])];
    assert.equal(needsInputBackfill(clean), false);
    const same = provider("xjm", clean);
    assert.equal(wrapForInputBackfill(same).getModels(), clean);
  });

  it("keeps id, auth, and stream from the composed provider", () => {
    const base = provider("xjm", [model("deepseek-v4.1-flash", ["text"])]);
    const wrapped = wrapForInputBackfill(base);
    assert.equal(wrapped.id, base.id);
    assert.equal(wrapped.auth, base.auth);
    assert.equal(wrapped.stream, base.stream);
    assert.equal(wrapped.streamSimple, base.streamSimple);
  });

  it("re-registers only providers that need it, and is idempotent", async () => {
    const providers = new Map<string, Provider>([
      ["xjm", provider("xjm", [model("deepseek-v4.1-flash", ["text"])])],
      ["clean", provider("clean", [model("deepseek-v4.1-flash", ["text", "image"])])],
    ]);
    const registered: string[] = [];
    const registry: InputBackfillRegistry = {
      getProviders: () => [...providers.values()],
      getProvider: (id) => providers.get(id),
      registerProvider: (next) => {
        registered.push(next.id);
        providers.set(next.id, next);
      },
      unregisterProvider: (id) => void registered.push(`-${id}`),
    };

    assert.equal(await applyInputBackfill(registry), 1);
    assert.deepEqual(registered, ["xjm"]);
    assert.deepEqual(providers.get("xjm")?.getModels()[0]?.input, ["text", "image"]);

    // Second pass: the wrapper now reports a clean list, so nothing re-registers.
    registered.length = 0;
    assert.equal(await applyInputBackfill(registry), 0);
    assert.deepEqual(registered, ["-xjm"]);
  });
});

describe("persistInputBackfill", () => {
  it("rewrites models.json once, with a backup, then stops", async () => {
    await withAgentDir(async (dir) => {
      const path = getModelsJsonPath();
      assert.equal(path, join(dir, "models.json"));
      await writeFile(
        path,
        `${JSON.stringify(
          {
            providers: {
              xjm: {
                name: "xjm",
                api: "openai-completions",
                baseUrl: "https://relay.example/v1",
                models: [
                  { id: "deepseek-v4.1-flash", name: "deepseek", input: ["text"], cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } },
                  { id: "glm-5.3", name: "glm", input: ["text"] },
                ],
              },
            },
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );

      const changes = await persistInputBackfill();
      assert.deepEqual(changes.map((change) => change.id), ["deepseek-v4.1-flash"]);

      const written = JSON.parse(await readFile(path, "utf8")) as ModelsFile;
      assert.deepEqual(written.providers.xjm?.models?.[0]?.input, ["text", "image"]);
      assert.deepEqual(written.providers.xjm?.models?.[1]?.input, ["text"]);
      // Hand-written cost survives the rewrite.
      assert.deepEqual(written.providers.xjm?.models?.[0]?.cost, { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 });

      const backupsAfterFirst = (await readdir(dir)).filter((name) => name.startsWith("models.json.bak-"));
      assert.equal(backupsAfterFirst.length, 1);

      // Already correct: no second write, therefore no second backup.
      assert.deepEqual(await persistInputBackfill(), []);
      const backupsAfterSecond = (await readdir(dir)).filter((name) => name.startsWith("models.json.bak-"));
      assert.equal(backupsAfterSecond.length, 1);
    });
  });
});
