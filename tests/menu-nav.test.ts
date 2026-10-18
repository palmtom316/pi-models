import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setLang, t } from "../src/i18n.ts";
import { runManageMenu, runProvidersMenu, wizardHideProvider } from "../src/manage.ts";
import type { PimOption, PimUi } from "../src/ui/pim-ui.ts";
import { FOOTER_SELECT_EXIT } from "../src/ui/dialogs.ts";
import { mainMenuItems, mainMenuOptions, runMainMenu, wizardNew, wizardSwitchDefault, type CmdCtx } from "../src/wizard.ts";

function emptyCtx(): CmdCtx {
  return {
    mode: "tui",
    ui: { notify: () => undefined, custom: () => undefined },
    modelRegistry: {
      refresh: async () => undefined,
      getError: () => undefined,
      find: () => undefined,
    },
  };
}

async function withAgentDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pim-menu-"));
  const prev = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  }
}

/** Every fake select gets PimOption[]; this pulls the id back out. */
function ids(options: Array<string | PimOption>): string[] {
  return options.map((option) => (typeof option === "string" ? option : option.value));
}

describe("main menu navigation", () => {
  it("orders daily work first, then maintenance, then exit", () => {
    setLang("en");
    assert.deepEqual(mainMenuOptions(), [
      t().menuProviders,
      t().menuSwitchDefault,
      t().menuNew,
      t().menuAdd,
      t().menuUsage,
      t().menuSettings,
      t().menuExit,
    ]);
    setLang("zh");
    assert.equal(mainMenuOptions()[0], t().menuProviders);
    assert.equal(mainMenuOptions().at(-1), t().menuExit);
    setLang("en");
  });

  it("returns to the main menu after a cancelled submenu, and Esc on the menu exits", async () => {
    setLang("en");
    await withAgentDir(async () => {
      const titles: string[] = [];
      const footers: Array<string | undefined> = [];
      const ui = {
        select: async (title: string, _options: unknown, _subtitle?: unknown, footer?: string) => {
          titles.push(title);
          footers.push(footer);
          if (title === t().menuTitle) {
            return titles.filter((x) => x === t().menuTitle).length === 1 ? "new" : undefined;
          }
          return undefined;
        },
        input: async () => undefined,
        confirm: async () => undefined,
        secret: async () => undefined,
        notify: () => undefined,
      } as unknown as PimUi;
      await runMainMenu(emptyCtx(), ui, { setModel: async () => false });
      assert.deepEqual(titles, [t().menuTitle, t().menuTitle]);
      assert.equal(footers[0], FOOTER_SELECT_EXIT());
    });
  });

  it("Providers hub Esc returns to the main menu", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: { QQ: { apiKey: "sk", models: [{ id: "m", api: "openai-completions", baseUrl: "https://x/v1" }] } },
      }));
      const titles: string[] = [];
      const ui = {
        select: async (title: string) => {
          titles.push(title);
          if (title === t().menuTitle) {
            return titles.filter((x) => x === t().menuTitle).length === 1 ? "providers" : undefined;
          }
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runMainMenu(emptyCtx(), ui, { setModel: async () => false });
      assert.deepEqual(titles, [t().menuTitle, t().providersTitle, t().menuTitle]);
    });
  });

  it("Exit closes the overlay without dispatching a submenu", async () => {
    setLang("en");
    await withAgentDir(async () => {
      let selects = 0;
      const ui = {
        select: async () => {
          selects++;
          return "exit";
        },
        input: async () => {
          throw new Error("should not open a submenu");
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runMainMenu(emptyCtx(), ui, { setModel: async () => false });
      assert.equal(selects, 1);
    });
  });

  it("Settings opens the language / cache submenu, not a blind toggle", async () => {
    setLang("en");
    await withAgentDir(async () => {
      const titles: string[] = [];
      const ui = {
        select: async (title: string) => {
          titles.push(title);
          if (title === t().menuTitle) {
            return titles.filter((x) => x === t().menuTitle).length === 1 ? "settings" : undefined;
          }
          if (title === t().settingsTitle) return "back";
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runMainMenu(emptyCtx(), ui, { setModel: async () => false });
      assert.deepEqual(titles, [t().menuTitle, t().settingsTitle, t().menuTitle]);
    });
  });
});

describe("main menu rows", () => {
  it("carries a stable id and a one-line hint per row", () => {
    for (const lang of ["en", "zh"] as const) {
      setLang(lang);
      const items = mainMenuItems();
      assert.deepEqual(items.map((item) => item.value), [
        "providers",
        "switchDefault",
        "new",
        "add",
        "usage",
        "settings",
        "exit",
      ]);
      for (const item of items) assert.ok(item.description, `missing hint for ${item.value}`);
    }
    setLang("en");
  });
});

describe("wizard step-back", () => {
  it("Esc on API type returns to the provider name prompt", async () => {
    setLang("en");
    const prompts: string[] = [];
    const ui = {
      input: async (title: string) => {
        prompts.push(`input:${title}`);
        if (title === t().inputProviderName) {
          return prompts.filter((p) => p.startsWith("input:")).length === 1 ? "QQ" : undefined;
        }
        return undefined;
      },
      select: async (title: string) => {
        prompts.push(`select:${title}`);
        return undefined;
      },
      confirm: async () => undefined,
      notify: () => undefined,
    } as unknown as PimUi;
    await wizardNew(emptyCtx(), ui, { providers: {} }, { setModel: async () => false });
    assert.deepEqual(prompts, [
      `input:${t().inputProviderName}`,
      `select:${t().selectApiType}`,
      `input:${t().inputProviderName}`,
    ]);
  });

  it("Esc on baseUrl returns to API type", async () => {
    setLang("en");
    const prompts: string[] = [];
    let names = 0;
    let apis = 0;
    const ui = {
      input: async (title: string) => {
        prompts.push(`input:${title}`);
        if (title === t().inputProviderName) {
          names++;
          return names === 1 ? "QQ" : undefined;
        }
        return undefined;
      },
      select: async (title: string) => {
        prompts.push(`select:${title}`);
        if (title === t().selectApiType) {
          apis++;
          return apis === 1 ? "openai-completions" : undefined;
        }
        return undefined;
      },
      confirm: async () => undefined,
      notify: () => undefined,
    } as unknown as PimUi;
    await wizardNew(emptyCtx(), ui, { providers: {} }, { setModel: async () => false });
    assert.deepEqual(prompts, [
      `input:${t().inputProviderName}`,
      `select:${t().selectApiType}`,
      `input:${t().inputBaseUrl}`,
      `select:${t().selectApiType}`,
      `input:${t().inputProviderName}`,
    ]);
  });

  it("Esc on User-Agent returns to baseUrl", async () => {
    setLang("en");
    const prompts: string[] = [];
    let names = 0;
    let urls = 0;
    let apis = 0;
    const ui = {
      input: async (title: string) => {
        prompts.push(`input:${title}`);
        if (title === t().inputProviderName) {
          names++;
          return names === 1 ? "QQ" : undefined;
        }
        if (title === t().inputBaseUrl) {
          urls++;
          return urls === 1 ? "https://relay.example/v1" : undefined;
        }
        return undefined;
      },
      select: async (title: string) => {
        prompts.push(`select:${title}`);
        if (title === t().selectApiType) {
          apis++;
          return apis === 1 ? "openai-completions" : undefined;
        }
        return undefined;
      },
      confirm: async (title: string) => {
        prompts.push(`confirm:${title}`);
        return undefined;
      },
      secret: async () => undefined,
      notify: () => undefined,
    } as unknown as PimUi;
    await wizardNew(emptyCtx(), ui, { providers: {} }, { setModel: async () => false });
    assert.deepEqual(prompts, [
      `input:${t().inputProviderName}`,
      `select:${t().selectApiType}`,
      `input:${t().inputBaseUrl}`,
      `confirm:${t().confirmUserAgent}`,
      `input:${t().inputBaseUrl}`,
      `select:${t().selectApiType}`,
      `input:${t().inputProviderName}`,
    ]);
  });

  it("Esc on the builtin-name confirm stays on the name prompt", async () => {
    setLang("en");
    const prompts: string[] = [];
    const ui = {
      input: async (title: string) => {
        prompts.push(`input:${title}`);
        if (prompts.filter((p) => p.startsWith("input:")).length === 1) return "openai";
        return undefined;
      },
      confirm: async (title: string) => {
        prompts.push(`confirm:${title}`);
        return undefined;
      },
      select: async () => {
        throw new Error("should not advance to API type");
      },
      notify: () => undefined,
    } as unknown as PimUi;
    await wizardNew(emptyCtx(), ui, { providers: {} }, { setModel: async () => false });
    assert.deepEqual(prompts, [
      `input:${t().inputProviderName}`,
      `confirm:${t().builtinName}`,
      `input:${t().inputProviderName}`,
    ]);
  });
});

describe("switch default model", () => {
  it("writes settings.json and calls setModel for the chosen model", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: {
            apiKey: "sk",
            models: [
              { id: "old", api: "openai-completions", baseUrl: "https://x/v1" },
              { id: "glm", api: "openai-completions", baseUrl: "https://x/v1" },
            ],
          },
        },
      }));
      await writeFile(join(dir, "settings.json"), JSON.stringify({
        theme: "dark",
        defaultProvider: "QQ",
        defaultModel: "old",
      }));
      const found: string[] = [];
      const switched: string[] = [];
      const ctx: CmdCtx = {
        ...emptyCtx(),
        modelRegistry: {
          refresh: async () => undefined,
          getError: () => undefined,
          find: (provider: string, id: string) => {
            found.push(`${provider}/${id}`);
            return { provider, id };
          },
        },
      };
      const ui = {
        select: async (title: string, options: Array<string | PimOption>) => {
          if (title === t().selectProvider) return "QQ";
          if (title === t().selectDefaultModel) return ids(options).find((id) => id.startsWith("glm")) ?? "glm";
          return undefined;
        },
        confirm: async () => true,
        notify: () => undefined,
      } as unknown as PimUi;
      await wizardSwitchDefault(ctx, ui, {
        setModel: async (model: { provider: string; id: string }) => {
          switched.push(`${model.provider}/${model.id}`);
          return true;
        },
      });
      const settings = JSON.parse(await readFile(join(dir, "settings.json"), "utf8")) as {
        theme: string;
        defaultProvider: string;
        defaultModel: string;
      };
      assert.equal(settings.theme, "dark");
      assert.equal(settings.defaultProvider, "QQ");
      assert.equal(settings.defaultModel, "glm");
      assert.deepEqual(found, ["QQ/glm"]);
      assert.deepEqual(switched, ["QQ/glm"]);
    });
  });

  it("notifies when models.json has no providers", async () => {
    setLang("en");
    await withAgentDir(async () => {
      const notices: string[] = [];
      const ui = {
        select: async () => {
          throw new Error("should not open a selector");
        },
        notify: (message: string) => notices.push(message),
      } as unknown as PimUi;
      await wizardSwitchDefault(emptyCtx(), ui, { setModel: async () => false });
      assert.deepEqual(notices, [t().noProvidersInFile]);
    });
  });

  it("Esc on the provider list returns without writing settings", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: { apiKey: "sk", models: [{ id: "m", api: "openai-completions", baseUrl: "https://x/v1" }] },
        },
      }));
      await writeFile(join(dir, "settings.json"), JSON.stringify({
        defaultProvider: "QQ",
        defaultModel: "m",
      }));
      const ui = {
        select: async () => undefined,
        confirm: async () => {
          throw new Error("should not confirm");
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await wizardSwitchDefault(emptyCtx(), ui, { setModel: async () => false });
      const settings = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
      assert.equal(settings.defaultModel, "m");
    });
  });

  it("pre-selects the current model and marks it in the row description", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: {
            models: [
              { id: "old", api: "openai-completions", baseUrl: "https://x/v1" },
              { id: "glm", api: "openai-completions", baseUrl: "https://x/v1" },
            ],
          },
        },
      }));
      await writeFile(join(dir, "settings.json"), JSON.stringify({ defaultProvider: "QQ", defaultModel: "glm" }));
      let seenInitial: string | undefined;
      let marked: string | undefined;
      let visits = 0;
      const ui = {
        select: async (
          title: string,
          options: Array<string | PimOption>,
          _subtitle?: unknown,
          _footer?: unknown,
          opts?: { initialValue?: string },
        ) => {
          if (title === t().selectProvider) return visits++ === 0 ? "QQ" : undefined;
          if (title === t().selectDefaultModel) {
            seenInitial = opts?.initialValue;
            marked = (options as PimOption[]).find((option) => option.value === "glm")?.description;
            return undefined;
          }
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await wizardSwitchDefault(emptyCtx(), ui, { setModel: async () => false });
      assert.equal(seenInitial, "glm");
      assert.match(marked ?? "", /\*/);
    });
  });
});

describe("provider hub", () => {
  it("Esc from a provider action returns to the provider list", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: { apiKey: "sk", models: [{ id: "m", api: "openai-completions", baseUrl: "https://x/v1" }] },
        },
      }));
      const titles: string[] = [];
      const ui = {
        select: async (title: string) => {
          titles.push(title);
          if (title === t().providersTitle) {
            return titles.filter((x) => x === t().providersTitle).length === 1 ? "QQ" : undefined;
          }
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runProvidersMenu(ui, emptyCtx());
      assert.deepEqual(titles, [t().providersTitle, "QQ", t().providersTitle]);
    });
  });

  it("marks the delete action as dangerous and keeps it last", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: { apiKey: "sk", models: [{ id: "m", api: "openai-completions", baseUrl: "https://x/v1" }] },
        },
      }));
      let rows: PimOption[] = [];
      let visits = 0;
      const ui = {
        select: async (title: string, options: Array<string | PimOption>) => {
          if (title === t().providersTitle) return visits++ === 0 ? "QQ" : undefined;
          rows = options as PimOption[];
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runProvidersMenu(ui, emptyCtx());
      const danger = rows.filter((row) => row.danger);
      assert.deepEqual(danger.map((row) => row.value), ["deleteProvider"]);
      assert.equal(rows.at(-1)?.value, "deleteProvider");
    });
  });

  it("legacy runManageMenu is the provider hub", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: { apiKey: "sk", models: [{ id: "m", api: "openai-completions", baseUrl: "https://x/v1" }] },
        },
      }));
      const titles: string[] = [];
      const ui = {
        select: async (title: string) => {
          titles.push(title);
          if (title === t().providersTitle) {
            return titles.filter((x) => x === t().providersTitle).length === 1 ? "QQ" : undefined;
          }
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runManageMenu(ui, emptyCtx());
      assert.deepEqual(titles, [t().providersTitle, "QQ", t().providersTitle]);
    });
  });

  it("hides a provider in the sidecar and can show it again", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({
        providers: {
          QQ: { apiKey: "sk", models: [{ id: "m", api: "openai-completions", baseUrl: "https://x/v1" }] },
        },
      }));
      const registered: string[] = [];
      let visits = 0;
      let actions = 0;
      const ui = {
        select: async (title: string) => {
          if (title === t().providersTitle) return visits++ === 0 ? "QQ" : undefined;
          if (title === "QQ") return actions++ === 0 ? "hide" : undefined;
          return undefined;
        },
        confirm: async () => true,
        notify: () => undefined,
      } as unknown as PimUi;
      const ctx = emptyCtx();
      ctx.modelRegistry = {
        ...ctx.modelRegistry,
        getProvider: () => ({ id: "QQ" }) as never,
        registerProvider: (provider: { id: string }) => registered.push(provider.id),
        unregisterProvider: () => undefined,
      };
      await runManageMenu(ui, ctx);
      const sidecar = JSON.parse(await readFile(join(dir, "pim-models.json"), "utf8"));
      assert.deepEqual(sidecar.hiddenProviders, ["QQ"]);
      assert.deepEqual(registered, ["QQ"]);
      const models = JSON.parse(await readFile(join(dir, "models.json"), "utf8"));
      assert.equal(models.providers.QQ.models[0].id, "m");
    });
  });

  it("reports no providers, not already-hidden, when models.json is empty", async () => {
    setLang("en");
    await withAgentDir(async (dir) => {
      await writeFile(join(dir, "models.json"), JSON.stringify({ providers: {} }));
      await writeFile(join(dir, "pim-models.json"), JSON.stringify({ hiddenProviders: ["QQ"] }));
      const notices: Array<[string, string]> = [];
      const ui = {
        select: async () => undefined,
        confirm: async () => true,
        notify: (message: string, level: string) => notices.push([message, level]),
      } as unknown as PimUi;
      await wizardHideProvider(ui, { modelRegistry: { refresh: async () => undefined, getError: () => undefined } },
        JSON.parse(await readFile(join(dir, "models.json"), "utf8")));
      assert.deepEqual(notices, [[t().noProvidersInFile, "warning"]]);
    });
  });
});
