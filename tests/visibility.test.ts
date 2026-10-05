import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Model, Provider } from "@earendil-works/pi-ai";
import { readSidecar } from "../src/sidecar.ts";
import {
  applyVisibility,
  hideChatModels,
  isHidden,
  setProviderHidden,
  wrapForVisibility,
} from "../src/visibility.ts";

function model(id: string): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "QQ",
    baseUrl: "https://relay.example/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8,
    maxTokens: 8,
  };
}

function provider(id: string, extra?: Partial<Provider>): Provider {
  return {
    id,
    name: id,
    auth: {},
    getModels: () => [model("a"), model("b")],
    stream: () => {
      throw new Error("unused");
    },
    streamSimple: () => {
      throw new Error("unused");
    },
    ...extra,
  };
}

async function withAgentDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pim-hide-"));
  const prev = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  }
}

describe("hide filter", () => {
  it("drops every chat model only while hidden, and still runs the built-in filter", () => {
    const models = [model("a"), model("b"), model("image-gen")];
    const base = (list: readonly Model<"openai-completions">[]) => list.filter((item) => item.id !== "image-gen");
    assert.deepEqual(hideChatModels(false, models, undefined, base).map((item) => item.id), ["a", "b"]);
    assert.deepEqual(hideChatModels(true, models, undefined, base), []);
    assert.equal(isHidden(["QQ"], "QQ"), true);
    assert.equal(isHidden(["QQ"], "ELY"), false);
    assert.equal(isHidden(undefined, "QQ"), false);
  });

  it("keeps stream and auth from the composed provider", () => {
    const base = provider("QQ", {
      filterModels: (models) => models.filter((item) => item.id === "a"),
    });
    const wrapped = wrapForVisibility(base, true);
    assert.equal(wrapped.stream, base.stream);
    assert.equal(wrapped.auth, base.auth);
    assert.deepEqual(wrapped.filterModels?.([model("a"), model("b")], undefined), []);

    const shown = wrapForVisibility(base, false);
    assert.deepEqual(shown.filterModels?.([model("a"), model("b")], undefined)?.map((item) => item.id), ["a"]);
  });
});

describe("hiddenProviders sidecar", () => {
  it("toggles a provider without dropping other sidecar fields", async () => {
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "pim-models.json"), JSON.stringify({
        lastProvider: "ELY",
        lang: "zh",
      }));
      await setProviderHidden("QQ", true);
      await setProviderHidden("ELY", true);
      await setProviderHidden("QQ", false);
      const stored = await readSidecar();
      assert.deepEqual(stored.hiddenProviders, ["ELY"]);
      assert.equal(stored.lastProvider, "ELY");
      assert.equal(stored.lang, "zh");
    });
  });

  it("registers a wrapper for hidden providers and unregisters them when shown", async () => {
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "pim-models.json"), JSON.stringify({ hiddenProviders: ["QQ"] }));
      const registered: Provider[] = [];
      const unregistered: string[] = [];
      const registry = {
        getProvider: (id: string) => (id === "QQ" ? provider("QQ") : undefined),
        registerProvider: (next: Provider) => registered.push(next),
        unregisterProvider: (id: string) => unregistered.push(id),
      };
      await applyVisibility(registry);
      assert.equal(registered.length, 1);
      assert.equal(registered[0]?.id, "QQ");
      assert.deepEqual(registered[0]?.filterModels?.([model("a")], undefined), []);

      const raw = JSON.parse(await readFile(join(dir, "pim-models.json"), "utf8")) as { hiddenProviders?: string[] };
      raw.hiddenProviders = [];
      await writeFile(join(dir, "pim-models.json"), JSON.stringify(raw));
      await applyVisibility(registry);
      assert.deepEqual(unregistered, ["QQ"]);
    });
  });
});
