import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import { fetchCatalog, parseManualIds } from "./catalog.ts";
import { isNonChatModality } from "./defaults.ts";
import { matchLabel } from "./match.ts";
import { loadOfficialCatalog } from "./models-dev.ts";
import {
  applyDrafts,
  clashesBuiltin,
  listExistingProviders,
  providerNameOk,
  readModelsFile,
  writeModelsFile,
} from "./models-json.ts";
import { runManageMenu } from "./manage.ts";
import { enrichUnknownDrafts, resolveDrafts } from "./resolve.ts";
import { canonicalizeUrl } from "./url.ts";
import { writeSidecar } from "./sidecar.ts";
import { PI_APIS, type ModelDraft, type ModelsFile, type PiApi, type WizardApi } from "./types.ts";
import { maybeEditDrafts } from "./ui/edit-caps.ts";
import { multiSelect } from "./ui/multi-select.ts";
import { secretInput } from "./ui/secret-input.ts";

type CmdCtx = {
  mode: string;
  ui: {
    select: (title: string, options: string[]) => Promise<string | undefined>;
    confirm: (title: string, message: string) => Promise<boolean>;
    input: (title: string, placeholder?: string) => Promise<string | undefined>;
    notify: (message: string, type?: "info" | "warning" | "error") => void;
    custom: Function;
  };
  modelRegistry: {
    refresh: () => Promise<unknown>;
    getError: () => string | undefined;
    find: (provider: string, id: string) => unknown;
  };
};

function failNonTui(ctx: CmdCtx): boolean {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("hub-models is interactive-only (TUI)", "error");
    return true;
  }
  return false;
}

async function pickApi(ctx: CmdCtx): Promise<PiApi | undefined> {
  const choice = await ctx.ui.select("API type", [...PI_APIS]);
  return (choice as PiApi | undefined) ?? undefined;
}

async function collectApis(ctx: CmdCtx): Promise<Array<{ api: PiApi; baseUrl: string; userAgent: boolean }> | undefined> {
  const apis: Array<{ api: PiApi; baseUrl: string; userAgent: boolean }> = [];
  while (true) {
    const api = await pickApi(ctx);
    if (!api) {
      if (apis.length === 0) return undefined;
      break;
    }
    const raw = await ctx.ui.input("baseUrl", "https://example.com/v1");
    if (!raw) {
      if (apis.length === 0) return undefined;
      break;
    }
    let baseUrl: string;
    try {
      baseUrl = canonicalizeUrl(raw);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      continue;
    }
    const ua = await ctx.ui.confirm("User-Agent", "Send User-Agent: node ?");
    apis.push({ api, baseUrl, userAgent: ua !== false });
    const more = await ctx.ui.confirm("Add another API?", `${apis.length} API(s) so far. Add another protocol/URL?`);
    if (!more) break;
  }
  return apis.length ? apis : undefined;
}

async function loadCatalogWithUi(ctx: CmdCtx, api: PiApi, baseUrl: string, apiKey: string, userAgent: boolean) {
  return ctx.ui.custom((tui: unknown, theme: unknown, _kb: unknown, done: (v: Awaited<ReturnType<typeof fetchCatalog>> | null) => void) => {
    const loader = new BorderedLoader(tui as never, theme as never, `Fetching ${api} models…`);
    loader.onAbort = () => done(null);
    fetchCatalog({ api, baseUrl, apiKey, signal: loader.signal, userAgent })
      .then((r) => done(r))
      .catch((error) =>
        done({
          ok: false,
          items: [],
          tried: [],
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return loader;
  });
}

async function draftsForApi(
  ctx: CmdCtx,
  spec: { api: PiApi; baseUrl: string; userAgent: boolean },
  apiKey: string,
  existingIds: Set<string>,
): Promise<ModelDraft[] | undefined> {
  const catalog = await loadCatalogWithUi(ctx, spec.api, spec.baseUrl, apiKey, spec.userAgent);
  if (catalog === null) return undefined;

  let items = catalog.ok ? catalog.items : [];
  if (!catalog.ok) {
    ctx.ui.notify(catalog.error ?? "catalog failed", "warning");
    if (catalog.html && catalog.suggestV1) {
      ctx.ui.notify(`Response looked like HTML. Try ${catalog.suggestV1}`, "warning");
    }
    const typed = await ctx.ui.input("Model ids (comma-separated), or empty to skip", "claude-opus-5, gpt-5.6-sol");
    if (!typed) return [];
    items = parseManualIds(typed).map((id) => ({ id }));
  }

  if (items.length === 0) {
    ctx.ui.notify("No models on this API", "warning");
    return [];
  }

  const preview = resolveDrafts(items, spec.api, spec.baseUrl, { userAgent: spec.userAgent });
  const selected = await multiSelect(
    ctx,
    `${spec.api} @ ${spec.baseUrl}`,
    preview.drafts.map((d) => ({
      value: d.id,
      label: d.id,
      description: `${matchLabel(d.match)}  ${d.contextWindow}/${d.maxTokens}`,
      hiddenByDefault: isNonChatModality(d.id, d.match.official),
      checked: d.match.kind === "official" && !existingIds.has(d.id),
    })),
  );
  if (!selected) return undefined;

  const pickedItems = items.filter((item) => selected.includes(item.id));
  const unknownSelected = preview.unknownIds.filter((id) => selected.includes(id));
  let drafts = preview.drafts.filter((d) => selected.includes(d.id));
  if (unknownSelected.length > 0) {
    const enriched = await ctx.ui.custom(
      (tui: unknown, theme: unknown, _kb: unknown, done: (v: Awaited<ReturnType<typeof enrichUnknownDrafts>>) => void) => {
        const loader = new BorderedLoader(
          tui as never,
          theme as never,
          `Looking up ${unknownSelected.length} new model(s) on models.dev…`,
        );
        enrichUnknownDrafts(pickedItems, spec.api, spec.baseUrl, unknownSelected, {
          userAgent: spec.userAgent,
          signal: loader.signal,
        })
          .then(done)
          .catch(() => done({ drafts }));
        return loader;
      },
    );
    drafts = enriched.drafts.filter((d) => selected.includes(d.id));
    if (enriched.remote?.warning) ctx.ui.notify(enriched.remote.warning, "warning");
  }

  const out: ModelDraft[] = [];
  for (const draft of drafts) {
    if (!existingIds.has(draft.id)) {
      out.push(draft);
      continue;
    }
    const choice = await ctx.ui.select(
      `id "${draft.id}" already exists. Keep existing, replace with this API, or skip?`,
      ["keep existing", "replace with this API", "skip"],
    );
    if (choice === "replace with this API") out.push({ ...draft, replaceExisting: true });
  }
  return maybeEditDrafts(ctx, out);
}

async function persist(
  ctx: CmdCtx,
  file: ModelsFile,
  providerId: string,
  apiKey: string | undefined,
  drafts: ModelDraft[],
  mode: "merge" | "replace-endpoint",
  pi?: { setModel: (model: unknown) => Promise<boolean> },
): Promise<void> {
  if (drafts.length === 0) {
    ctx.ui.notify("Nothing to write", "warning");
    return;
  }
  const missing = drafts.filter((d) => !d.api || !d.baseUrl);
  if (missing.length) {
    ctx.ui.notify("internal: draft missing api/baseUrl", "error");
    return;
  }
  const summary = drafts
    .map((d) => `${d.id}  ${d.api}`)
    .slice(0, 12)
    .join("\n");
  const ok = await ctx.ui.confirm("Write models.json?", `${drafts.length} model(s) → ${providerId}\n${summary}`);
  if (!ok) return;

  const merged = applyDrafts(file, { providerId, apiKey, drafts, mode });
  const { backupPath } = await writeModelsFile(merged.file);
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ctx.ui.notify(`refresh failed: ${err}${backupPath ? `\nbackup: ${backupPath}` : ""}`, "error");
    return;
  }
  const apis = [...new Set(drafts.map((d) => d.api))].join(", ");
  ctx.ui.notify(`Wrote ${drafts.length} model(s) on ${providerId} (${apis})`, "info");
  if (merged.sunkThinking) {
    ctx.ui.notify("Moved provider thinkingFormat onto existing OpenAI models before adding native API", "info");
  }
  await writeSidecar({
    lastProvider: providerId,
    lastEndpoints: drafts.map((d) => ({ provider: providerId, api: d.api, baseUrl: d.baseUrl })),
  });
  const first = drafts[0];
  if (first && pi) {
    const jump = await ctx.ui.confirm("Switch model?", `Switch to ${providerId}/${first.id}?`);
    if (jump) {
      const model = ctx.modelRegistry.find(providerId, first.id);
      const okSwitch = model ? await pi.setModel(model) : false;
      if (!okSwitch) ctx.ui.notify("setModel failed (missing key?)", "warning");
    }
  }
}

async function wizardNew(ctx: CmdCtx, file: ModelsFile, pi: { setModel: Function }): Promise<void> {
  const name = await ctx.ui.input("Provider name", "ELY");
  if (!name) return;
  if (!providerNameOk(name)) {
    ctx.ui.notify("Name must match [A-Za-z][A-Za-z0-9_-]{0,31}", "error");
    return;
  }
  if (clashesBuiltin(name)) {
    const go = await ctx.ui.confirm("Built-in name", `${name} is a built-in / reserved provider id. Override it?`);
    if (!go) return;
  }
  if (file.providers[name]) {
    const go = await ctx.ui.confirm("Exists", `${name} already exists. Merge new models into it?`);
    if (!go) return;
  }
  const apiKey = await secretInput(ctx, "API key (shared by all APIs)");
  if (!apiKey) return;

  const specs = await collectApis(ctx);
  if (!specs) return;

  const existing = new Set((file.providers[name]?.models ?? []).map((m) => m.id));
  const all: ModelDraft[] = [];
  for (const spec of specs) {
    const drafts = await draftsForApi(ctx, spec, apiKey, existing);
    if (drafts === undefined) return;
    for (const d of drafts) {
      all.push(d);
      existing.add(d.id);
    }
  }
  await persist(ctx, file, name, apiKey, all, "merge", pi);
}

async function wizardAddApi(ctx: CmdCtx, file: ModelsFile, pi: { setModel: Function }): Promise<void> {
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ctx.ui.notify("No providers in models.json. Create one first.", "warning");
    return;
  }
  const name = await ctx.ui.select("Provider", names);
  if (!name) return;
  const provider = file.providers[name];
  const apiKey =
    (provider?.apiKey && !provider.apiKey.startsWith("$") && !provider.apiKey.startsWith("!")
      ? provider.apiKey
      : undefined) ?? (await secretInput(ctx, `API key for ${name}`));
  if (!apiKey) return;

  const specs = await collectApis(ctx);
  if (!specs) return;
  const existing = new Set((provider?.models ?? []).map((m) => m.id));
  const all: ModelDraft[] = [];
  for (const spec of specs) {
    const drafts = await draftsForApi(ctx, spec, apiKey, existing);
    if (drafts === undefined) return;
    for (const d of drafts) {
      all.push(d);
      existing.add(d.id);
    }
  }

  const modeChoice = await ctx.ui.select("How to apply?", ["merge models", "replace these API endpoints", "cancel"]);
  if (!modeChoice || modeChoice === "cancel") return;
  const mode = modeChoice.startsWith("replace") ? "replace-endpoint" : "merge";
  await persist(ctx, file, name, provider?.apiKey ? undefined : apiKey, all, mode, pi);
}

async function wizardRefreshCache(ctx: CmdCtx): Promise<void> {
  const result = await ctx.ui.custom((tui: unknown, theme: unknown, _kb: unknown, done: (v: string) => void) => {
    const loader = new BorderedLoader(tui as never, theme as never, "Refreshing models.dev…");
    loader.onAbort = () => done("cancelled");
    loadOfficialCatalog({ force: true, signal: loader.signal })
      .then((r) => done(r.warning ?? `cached ${Object.keys(r.catalog).length} official buckets`))
      .catch((error) => done(error instanceof Error ? error.message : String(error)));
    return loader;
  });
  ctx.ui.notify(String(result), "info");
}

export async function runWizard(ctx: CmdCtx, pi: { setModel: Function }): Promise<void> {
  if (failNonTui(ctx)) return;

  const file = await readModelsFile();
  const action = await ctx.ui.select("hub-models", [
    "New provider (one or more APIs)",
    "Add API / models to existing provider",
    "Manage: backup / delete / edit",
    "Refresh models.dev cache",
    "Cancel",
  ]);
  if (!action || action === "Cancel") return;
  if (action.startsWith("New")) return wizardNew(ctx, file, pi);
  if (action.startsWith("Add")) return wizardAddApi(ctx, file, pi);
  if (action.startsWith("Manage")) return runManageMenu(ctx);
  if (action.startsWith("Refresh")) return wizardRefreshCache(ctx);
}

export type { WizardApi };
