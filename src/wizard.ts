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
  rollbackModelsFile,
  writeModelsFile,
} from "./models-json.ts";
import { runManageMenu } from "./manage.ts";
import { enrichUnknownDrafts, resolveDrafts } from "./resolve.ts";
import { canonicalizeUrl } from "./url.ts";
import { writeSidecar } from "./sidecar.ts";
import { PI_APIS, type ModelDraft, type ModelsFile, type PiApi, type WizardApi } from "./types.ts";
import { createHubUi, type HubUi } from "./ui/hub-ui.ts";
import { maybeEditDrafts } from "./ui/edit-caps.ts";

type CmdCtx = {
  mode: string;
  ui: {
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
    ctx.ui.notify("pi-hub is interactive-only (TUI)", "error");
    return true;
  }
  return false;
}

async function pickApi(ui: HubUi): Promise<PiApi | undefined> {
  const choice = await ui.select("API type", [...PI_APIS]);
  return (choice as PiApi | undefined) ?? undefined;
}

async function collectApis(ui: HubUi): Promise<Array<{ api: PiApi; baseUrl: string; userAgent: boolean }> | undefined> {
  const apis: Array<{ api: PiApi; baseUrl: string; userAgent: boolean }> = [];
  while (true) {
    const api = await pickApi(ui);
    if (!api) {
      if (apis.length === 0) return undefined;
      break;
    }
    const raw = await ui.input("baseUrl", "https://example.com/v1");
    if (!raw) {
      if (apis.length === 0) return undefined;
      break;
    }
    let baseUrl: string;
    try {
      baseUrl = canonicalizeUrl(raw);
    } catch (error) {
      ui.notify(error instanceof Error ? error.message : String(error), "error");
      continue;
    }
    const ua = await ui.confirm("User-Agent", "Send User-Agent: node ?");
    apis.push({ api, baseUrl, userAgent: ua !== false });
    const more = await ui.confirm("Add another API?", `${apis.length} API(s) so far. Add another protocol/URL?`);
    if (!more) break;
  }
  return apis.length ? apis : undefined;
}

export async function draftsForApi(
  ui: HubUi,
  spec: { api: PiApi; baseUrl: string; userAgent: boolean },
  apiKey: string,
  existingIds: Set<string>,
): Promise<ModelDraft[] | undefined> {
  const catalog = await ui.loader(
    `Fetching ${spec.api} models…`,
    (signal) => fetchCatalog({ api: spec.api, baseUrl: spec.baseUrl, apiKey, signal, userAgent: spec.userAgent }),
    null,
  );
  if (catalog === null) return undefined;

  let items = catalog.ok ? catalog.items : [];
  if (!catalog.ok) {
    ui.notify(catalog.error ?? "catalog failed", "warning");
    if (catalog.html && catalog.suggestV1) {
      ui.notify(`Response looked like HTML. Try ${catalog.suggestV1}`, "warning");
    }
  }

  if (items.length === 0) {
    if (catalog.ok) ui.notify("No models returned by this API", "warning");
    const typed = await ui.input("Model ids (comma-separated), or empty to skip", "claude-opus-5, gpt-5.6-sol");
    if (!typed) return [];
    items = parseManualIds(typed).map((id) => ({ id }));
  }

  const preview = resolveDrafts(items, spec.api, spec.baseUrl, { userAgent: spec.userAgent });
  const orderedDrafts = [...preview.drafts].sort((a, b) => {
    const rank = (kind: ModelDraft["match"]["kind"]) => kind === "official" ? 0 : kind === "fuzzy" ? 1 : 2;
    return rank(a.match.kind) - rank(b.match.kind) || a.id.localeCompare(b.id);
  });
  const selected = await ui.multiSelect(
    `${spec.api} @ ${spec.baseUrl}`,
    orderedDrafts.map((d) => ({
      value: d.id,
      label: d.id,
      description: `${existingIds.has(d.id) ? "! conflict  " : ""}${matchLabel(d.match)}  ${d.contextWindow}/${d.maxTokens}`,
      hiddenByDefault: isNonChatModality(d.id, d.match.official),
      checked: d.match.kind === "official" && !existingIds.has(d.id),
    })),
  );
  if (!selected) return undefined;

  const pickedItems = items.filter((item) => selected.includes(item.id));
  const unknownSelected = preview.unknownIds.filter((id) => selected.includes(id));
  let drafts = preview.drafts.filter((d) => selected.includes(d.id));
  if (unknownSelected.length > 0) {
    const enriched = await ui.loader(
      `Looking up ${unknownSelected.length} new model(s) on models.dev…`,
      (signal) =>
        enrichUnknownDrafts(pickedItems, spec.api, spec.baseUrl, unknownSelected, {
          userAgent: spec.userAgent,
          signal,
        }),
      { drafts },
    );
    drafts = enriched.drafts.filter((d) => selected.includes(d.id));
    if (enriched.remote?.warning) ui.notify(enriched.remote.warning, "warning");
    else if (enriched.remote?.fetchedAt) ui.notify(`models.dev catalog: ${enriched.remote.fetchedAt}`, "info");
  }

  const out: ModelDraft[] = [];
  for (const draft of drafts) {
    if (draft.match.kind === "fuzzy") {
      const accepted = await ui.confirm(
        "Confirm fuzzy model match",
        `${draft.id}\n→ ${draft.match.bucket}/${draft.match.officialId}\nUse this model's capabilities?`,
      );
      if (!accepted) continue;
    }
    if (!existingIds.has(draft.id)) {
      out.push(draft);
      continue;
    }
    const choice = await ui.select(`id "${draft.id}" already exists`, [
      "keep existing",
      "replace with this API",
      "skip",
    ]);
    if (choice === "replace with this API") out.push({ ...draft, replaceExisting: true });
  }
  return maybeEditDrafts(ui, out);
}

export async function persist(
  ctx: CmdCtx,
  ui: HubUi,
  file: ModelsFile,
  providerId: string,
  apiKey: string | undefined,
  drafts: ModelDraft[],
  mode: "merge" | "replace-endpoint",
  pi?: { setModel: (model: unknown) => Promise<boolean> },
): Promise<void> {
  if (drafts.length === 0) {
    ui.notify("Nothing to write", "warning");
    return;
  }
  if (drafts.some((d) => !d.api || !d.baseUrl)) {
    ui.notify("internal: draft missing api/baseUrl", "error");
    return;
  }
  const summary = drafts
    .map((d) => `${d.id}  ${d.api}`)
    .slice(0, 12)
    .join("\n");
  const ok = await ui.confirm("Write models.json?", `${drafts.length} model(s) → ${providerId}\n${summary}`);
  if (!ok) return;

  const merged = applyDrafts(file, { providerId, apiKey, drafts, mode });
  const { backupPath } = await writeModelsFile(merged.file);
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ui.notify(`refresh failed: ${err}${backupPath ? `\nbackup: ${backupPath}` : ""}`, "error");
    const restore = await ui.confirm(
      "Rollback models.json?",
      backupPath ? `Restore ${backupPath}?` : "Remove the newly created models.json?",
    );
    if (restore) {
      await rollbackModelsFile(backupPath);
      await ctx.modelRegistry.refresh();
      const rollbackError = ctx.modelRegistry.getError();
      ui.notify(rollbackError ? `Rollback refresh failed: ${rollbackError}` : "models.json rolled back", rollbackError ? "error" : "info");
    }
    return;
  }
  const apis = [...new Set(drafts.map((d) => d.api))].join(", ");
  const conflictNote = merged.skippedConflicts.length ? `; skipped ${merged.skippedConflicts.length} conflict(s)` : "";
  ui.notify(`Added ${merged.added} model(s), replaced ${merged.replaced} on ${providerId} (${apis})${conflictNote}`, "info");
  if (merged.sunkThinking) {
    ui.notify("Moved provider thinkingFormat onto existing OpenAI models before adding native API", "info");
  }
  await writeSidecar({
    lastProvider: providerId,
    lastEndpoints: drafts.map((d) => ({ provider: providerId, api: d.api, baseUrl: d.baseUrl })),
  });
  const first = drafts[0];
  if (first && pi) {
    const jump = await ui.confirm("Switch model?", `Switch to ${providerId}/${first.id}?`);
    if (jump) {
      const model = ctx.modelRegistry.find(providerId, first.id);
      const okSwitch = model ? await pi.setModel(model) : false;
      if (!okSwitch) ui.notify("setModel failed (missing key?)", "warning");
    }
  }
}

async function wizardNew(ctx: CmdCtx, ui: HubUi, file: ModelsFile, pi: { setModel: Function }): Promise<void> {
  const name = await ui.input("Provider name", "ELY");
  if (!name) return;
  if (!providerNameOk(name)) {
    ui.notify("Name must match [A-Za-z][A-Za-z0-9_-]{0,31}", "error");
    return;
  }
  if (clashesBuiltin(name)) {
    const go = await ui.confirm("Built-in name", `${name} is a built-in / reserved provider id. Override it?`);
    if (!go) return;
  }
  if (file.providers[name]) {
    const go = await ui.confirm("Exists", `${name} already exists. Merge new models into it?`);
    if (!go) return;
  }
  const apiKey = await ui.secret("API key (shared by all APIs)");
  if (!apiKey) return;

  const specs = await collectApis(ui);
  if (!specs) return;

  const existing = new Set((file.providers[name]?.models ?? []).map((m) => m.id));
  const all: ModelDraft[] = [];
  for (const spec of specs) {
    const drafts = await draftsForApi(ui, spec, apiKey, existing);
    if (drafts === undefined) return;
    for (const d of drafts) {
      all.push(d);
      existing.add(d.id);
    }
  }
  await persist(ctx, ui, file, name, apiKey, all, "merge", pi);
}

async function wizardAddApi(ctx: CmdCtx, ui: HubUi, file: ModelsFile, pi: { setModel: Function }): Promise<void> {
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify("No providers in models.json. Create one first.", "warning");
    return;
  }
  const name = await ui.select("Provider", names);
  if (!name) return;
  const provider = file.providers[name];
  const apiKey =
    (provider?.apiKey && !provider.apiKey.startsWith("$") && !provider.apiKey.startsWith("!")
      ? provider.apiKey
      : undefined) ?? (await ui.secret(`API key for ${name}`));
  if (!apiKey) return;

  const specs = await collectApis(ui);
  if (!specs) return;
  const existing = new Set((provider?.models ?? []).map((m) => m.id));
  const all: ModelDraft[] = [];
  for (const spec of specs) {
    const drafts = await draftsForApi(ui, spec, apiKey, existing);
    if (drafts === undefined) return;
    for (const d of drafts) {
      all.push(d);
      existing.add(d.id);
    }
  }

  const modeChoice = await ui.select("How to apply?", ["merge models", "replace these API endpoints", "cancel"]);
  if (!modeChoice || modeChoice === "cancel") return;
  const mode = modeChoice.startsWith("replace") ? "replace-endpoint" : "merge";
  await persist(ctx, ui, file, name, provider?.apiKey ? undefined : apiKey, all, mode, pi);
}

async function wizardRefreshCache(ui: HubUi): Promise<void> {
  const result = await ui.loader(
    "Refreshing models.dev…",
    async (signal) => {
      const remote = await loadOfficialCatalog({ force: true, signal });
      return remote.warning ?? `cached ${Object.keys(remote.catalog).length} official buckets at ${remote.fetchedAt ?? "unknown time"}`;
    },
    "cancelled",
  );
  ui.notify(String(result), "info");
}

export async function runWizard(ctx: CmdCtx, pi: { setModel: Function }): Promise<void> {
  if (failNonTui(ctx)) return;
  const ui = createHubUi(ctx);

  const file = await readModelsFile();
  const action = await ui.select("pi-hub", [
    "New provider (one or more APIs)",
    "Add API / models to existing provider",
    "Manage: backup / delete / edit",
    "Refresh models.dev cache",
    "Cancel",
  ]);
  if (!action || action === "Cancel") return;
  if (action.startsWith("New")) return wizardNew(ctx, ui, file, pi);
  if (action.startsWith("Add")) return wizardAddApi(ctx, ui, file, pi);
  if (action.startsWith("Manage")) return runManageMenu(ui, ctx);
  if (action.startsWith("Refresh")) return wizardRefreshCache(ui);
}

export type { WizardApi };
