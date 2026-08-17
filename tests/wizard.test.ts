import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { HubUi } from "../src/ui/hub-ui.ts";
import type { ModelDraft, ModelsFile } from "../src/types.ts";
import { draftsForApi, persist, runWizard } from "../src/wizard.ts";

describe("wizard boundaries", () => {
  it("does not touch disk outside TUI mode", async () => {
    const notices: string[] = [];
    await runWizard({
      mode: "print",
      ui: { notify: (message: string) => notices.push(message), custom: () => undefined },
      modelRegistry: {
        refresh: async () => undefined,
        getError: () => undefined,
        find: () => undefined,
      },
    }, { setModel: async () => false });
    assert.match(notices[0] ?? "", /interactive-only/);
  });

  it("allows manual ids when a successful catalog is empty", async () => {
    const ui = {
      loader: async () => ({ ok: true, items: [], tried: [] }),
      input: async () => "gpt-5.6-sol",
      multiSelect: async () => ["gpt-5.6-sol"],
      select: async () => "skip (keep defaults)",
      confirm: async () => true,
      notify: () => undefined,
    } as unknown as HubUi;
    const drafts = await draftsForApi(
      ui,
      { api: "openai-completions", baseUrl: "https://relay.example/v1", userAgent: true },
      "secret",
      new Set(),
    );
    assert.equal(drafts?.[0]?.id, "gpt-5.6-sol");
  });

  it("drops a fuzzy capability match when the user rejects it", async () => {
    const fuzzy: ModelDraft = {
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      api: "openai-completions",
      baseUrl: "https://relay.example/v1",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      match: {
        kind: "fuzzy",
        bucket: "anthropic",
        officialId: "claude-sonnet-5",
        score: 60,
        source: "models.dev",
      },
    };
    let loaderCall = 0;
    const ui = {
      loader: async () => {
        loaderCall++;
        if (loaderCall === 1) return { ok: true, items: [{ id: fuzzy.id }], tried: [] };
        return { drafts: [fuzzy], remote: { catalog: {}, fromCache: true, stale: false } };
      },
      multiSelect: async () => [fuzzy.id],
      confirm: async (title: string) => title !== "Confirm fuzzy model match",
      notify: () => undefined,
    } as unknown as HubUi;

    const drafts = await draftsForApi(
      ui,
      { api: "openai-completions", baseUrl: fuzzy.baseUrl, userAgent: true },
      "secret",
      new Set(),
    );
    assert.deepEqual(drafts, []);
  });

  it("restores the previous file when pi rejects the new configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-hub-wizard-"));
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      const before: ModelsFile = {
        providers: {
          Old: {
            apiKey: "old-key",
            models: [{ id: "old", api: "openai-completions", baseUrl: "https://old.example/v1" }],
          },
        },
      };
      await writeFile(join(dir, "models.json"), JSON.stringify(before));
      const draft: ModelDraft = {
        id: "new",
        name: "new",
        api: "openai-completions",
        baseUrl: "https://new.example/v1",
        reasoning: false,
        input: ["text"],
        contextWindow: 128_000,
        maxTokens: 16_384,
        match: { kind: "unmatched" },
      };
      let refreshes = 0;
      const ui = {
        confirm: async () => true,
        notify: () => undefined,
      } as unknown as HubUi;
      await persist({
        mode: "tui",
        ui: { notify: () => undefined, custom: () => undefined },
        modelRegistry: {
          refresh: async () => { refreshes++; },
          getError: () => refreshes === 1 ? "invalid config" : undefined,
          find: () => undefined,
        },
      }, ui, before, "New", "new-key", [draft], "merge");
      const restored = JSON.parse(await readFile(join(dir, "models.json"), "utf8"));
      assert.ok(restored.providers.Old);
      assert.equal(restored.providers.New, undefined);
      assert.equal(refreshes, 2);
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
    }
  });
});
