import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { PimUi } from "../src/ui/pim-ui.ts";
import type { ModelDraft, ModelsFile } from "../src/types.ts";
import { persist } from "../src/wizard.ts";

function draft(id: string, baseUrl: string): ModelDraft {
  return {
    id,
    name: id,
    api: "openai-completions",
    baseUrl,
    reasoning: true,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 32_768,
    match: { kind: "unmatched" },
  };
}

/**
 * Reproduces the wizardNew multi-group loop: same relay URL, two api keys,
 * each key written as its own provider (NAME, NAME-2). persist() must chain —
 * the second write must build on the first, not replace it.
 */
describe("multi-group persistence (wizardNew loop)", () => {
  it("keeps earlier groups when writing later groups", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-groups-"));
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      const ctx = {
        mode: "tui",
        ui: { notify: () => undefined, custom: () => undefined },
        modelRegistry: {
          refresh: async () => undefined,
          getError: () => undefined,
          find: () => undefined,
        },
      };
      const ui = {
        confirm: async () => true,
        notify: () => undefined,
      } as unknown as PimUi;

      let file: ModelsFile | undefined = { providers: {} };
      // Group 1: SSPL
      file = (await persist(
        ctx as never,
        ui,
        file,
        "SSPL",
        "sk-keyA",
        [draft("gpt-5.6-sol", "https://relay.example/v1")],
        "merge",
      )) ?? file;
      assert.ok(file, "first persist returned a file");
      // Group 2: SSPL-2 (same URL, different key)
      file = (await persist(
        ctx as never,
        ui,
        file,
        "SSPL-2",
        "sk-keyB",
        [draft("claude-opus-5", "https://relay.example/v1")],
        "merge",
      )) ?? file;
      assert.ok(file, "second persist returned a file");

      const onDisk = JSON.parse(await readFile(join(dir, "models.json"), "utf8")) as ModelsFile;
      const ids = Object.keys(onDisk.providers).sort();
      assert.deepEqual(ids, ["SSPL", "SSPL-2"]);
      assert.equal(onDisk.providers["SSPL"]?.apiKey, "sk-keyA");
      assert.equal(onDisk.providers["SSPL-2"]?.apiKey, "sk-keyB");
      assert.equal(onDisk.providers["SSPL"]?.models?.[0]?.id, "gpt-5.6-sol");
      assert.equal(onDisk.providers["SSPL-2"]?.models?.[0]?.id, "claude-opus-5");
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
    }
  });
});
