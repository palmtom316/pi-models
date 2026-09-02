import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setLang, t } from "../src/i18n.ts";
import { runManageMenu } from "../src/manage.ts";
import type { PimUi } from "../src/ui/pim-ui.ts";
import { FOOTER_SELECT_EXIT } from "../src/ui/dialogs.ts";
import { mainMenuOptions, runMainMenu, wizardNew, wizardSwitchDefault, type CmdCtx } from "../src/wizard.ts";

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

describe("main menu navigation", () => {
  it("orders browse → create → extend → manage, then settings / exit", () => {
    setLang("en");
    assert.deepEqual(mainMenuOptions(), [
      t().menuView,
      t().menuSwitchDefault,
      t().menuNew,
      t().menuAdd,
      t().menuManage,
      t().menuRefresh,
      t().menuLang("en"),
      t().menuExit,
    ]);
    setLang("zh");
    assert.equal(mainMenuOptions()[0], t().menuView);
    assert.equal(mainMenuOptions().at(-1), t().menuExit);
    setLang("en");
  });

  it("returns to the main menu after a cancelled submenu, and Esc on the menu exits", async () => {
    setLang("en");
    await withAgentDir(async () => {
      const titles: string[] = [];
      const footers: Array<string | undefined> = [];
      const ui = {
        select: async (title: string, _options: string[], _subtitle?: string, footer?: string) => {
          titles.push(title);
          footers.push(footer);
          if (title === t().menuTitle) {
            return titles.filter((x) => x === t().menuTitle).length === 1 ? t().menuNew : undefined;
          }
          return undefined;
        },
        input: async () => undefined,
        confirm: async () => undefined,
        notify: () => undefined,
      } as unknown as PimUi;
      await runMainMenu(emptyCtx(), ui, { setModel: async () => false });
      assert.deepEqual(titles, [t().menuTitle, t().menuTitle]);
      assert.equal(footers[0], FOOTER_SELECT_EXIT);
    });
  });

  it("Manage Back returns to the main menu", async () => {
    setLang("en");
    await withAgentDir(async () => {
      const titles: string[] = [];
      const ui = {
        select: async (title: string) => {
          titles.push(title);
          if (title === t().menuTitle) {
            return titles.filter((x) => x === t().menuTitle).length === 1 ? t().menuManage : undefined;
          }
          if (title === t().manageTitle) return t().manageBack;
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runMainMenu(emptyCtx(), ui, { setModel: async () => false });
      assert.deepEqual(titles, [t().menuTitle, t().manageTitle, t().menuTitle]);
    });
  });

  it("Exit label closes the overlay without dispatching a submenu", async () => {
    setLang("en");
    await withAgentDir(async () => {
      let selects = 0;
      const ui = {
        select: async () => {
          selects++;
          return t().menuExit;
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
        select: async (title: string, options: string[]) => {
          if (title === t().selectProvider) return "QQ";
          if (title === t().selectDefaultModel) return options.find((o) => o.startsWith("glm")) ?? "glm";
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
});

describe("manage menu loop", () => {
  it("Esc from a manage action returns to the manage menu", async () => {
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
          if (title === t().manageTitle) {
            return titles.filter((x) => x === t().manageTitle).length === 1
              ? t().manageBackup
              : t().manageBack;
          }
          return undefined;
        },
        notify: () => undefined,
      } as unknown as PimUi;
      await runManageMenu(ui, emptyCtx());
      assert.deepEqual(titles, [t().manageTitle, t().selectProvider, t().manageTitle]);
    });
  });
});
