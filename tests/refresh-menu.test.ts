import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setLang, t } from "../src/i18n.ts";
import { wizardRefreshModels, type RegistryCtx } from "../src/manage.ts";
import type { PimUi } from "../src/ui/pim-ui.ts";

async function withAgentDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pim-refresh-"));
  const prev = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  }
}

describe("refresh models menu", () => {
  it("adds a catalog model and removes a stale one without renaming the provider", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: {
            api: "openai-completions",
            baseUrl: "https://relay.example/v1",
            apiKey: "sk-test",
            models: [
              { id: "keep", name: "keep", api: "openai-completions", baseUrl: "https://relay.example/v1", reasoning: false, input: ["text"], contextWindow: 8, maxTokens: 8 },
              { id: "gone", name: "gone", api: "openai-completions", baseUrl: "https://relay.example/v1", reasoning: false, input: ["text"], contextWindow: 8, maxTokens: 8 },
            ],
          },
        },
      }));
      const titles: string[] = [];
      const ui = {
        select: async (title: string, options: string[]) => {
          titles.push(title);
          if (title === t().selectProvider) return options[0];
          return undefined;
        },
        multiSelect: async (title: string, items: Array<{ value: string }>) => {
          titles.push(title);
          return items.map((item) => item.value);
        },
        loader: async (_title: string, _work: unknown, _fallback: unknown) => ({
          ok: true,
          items: [{ id: "keep" }, { id: "fresh" }],
        }),
        confirm: async () => true,
        secret: async () => {
          throw new Error("stored key should be reused");
        },
        notify: () => undefined,
      } as unknown as PimUi;
      const ctx: RegistryCtx = {
        modelRegistry: { refresh: async () => undefined, getError: () => undefined },
      };
      await wizardRefreshModels(ui, ctx, JSON.parse(await readFile(join(dir, "models.json"), "utf8")));
      const written = JSON.parse(await readFile(join(dir, "models.json"), "utf8"));
      const ids = written.providers.QQ.models.map((model: { id: string }) => model.id).sort();
      assert.deepEqual(ids, ["fresh", "keep"]);
      assert.equal(written.providers.QQ.api, "openai-completions");
      assert.equal(written.providers.QQ.baseUrl, "https://relay.example/v1");
      assert.equal(written.providers.QQ.apiKey, "sk-test");
      assert.deepEqual(titles, [t().selectProvider, t().refreshModelsTitle, t().refreshRemovedTitle("QQ")]);
    });
  });

  it("does not offer a catalog id that is already stored on another endpoint", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: {
            models: [
              { id: "shared", name: "shared", api: "anthropic-messages", baseUrl: "https://a.example", reasoning: false, input: ["text"], contextWindow: 8, maxTokens: 8 },
              { id: "keep", name: "keep", api: "openai-completions", baseUrl: "https://b.example/v1", reasoning: false, input: ["text"], contextWindow: 8, maxTokens: 8 },
            ],
          },
        },
      }));
      const addOptions: string[] = [];
      const ui = {
        select: async (title: string, options: string[]) => {
          if (title === t().selectProvider) return options[0];
          if (title === t().refreshEndpointTitle("QQ")) {
            return options.find((label) => label.includes("openai-completions")) ?? options[0];
          }
          return undefined;
        },
        multiSelect: async (title: string, items: Array<{ value: string }>) => {
          if (title === t().refreshModelsTitle) addOptions.push(...items.map((item) => item.value));
          return items.map((item) => item.value);
        },
        loader: async () => ({ ok: true, items: [{ id: "keep" }, { id: "shared" }, { id: "new" }] }),
        confirm: async () => true,
        secret: async () => "sk-typed",
        notify: () => undefined,
      } as unknown as PimUi;
      const ctx: RegistryCtx = {
        modelRegistry: { refresh: async () => undefined, getError: () => undefined },
      };
      await wizardRefreshModels(ui, ctx, JSON.parse(await readFile(join(dir, "models.json"), "utf8")));
      assert.deepEqual(addOptions, ["new"]);
      const written = JSON.parse(await readFile(join(dir, "models.json"), "utf8"));
      const shared = written.providers.QQ.models.filter((model: { id: string }) => model.id === "shared");
      assert.equal(shared.length, 1);
      assert.equal(shared[0].baseUrl, "https://a.example");
    });
  });
});
