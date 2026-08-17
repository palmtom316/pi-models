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
import { PI_APIS, type ModelDraft, type ModelsFile, type PiApi } from "./types.ts";
import { createPimUi, type PimUi } from "./ui/pim-ui.ts";
import { maybeEditDrafts } from "./ui/edit-caps.ts";
import { loadLang, saveLang, t, otherLang, getLang, type Lang } from "./i18n.ts";

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
    ctx.ui.notify(t().errInteractiveOnly, "error");
    return true;
  }
  return false;
}

async function pickApi(ui: PimUi): Promise<PiApi | undefined> {
  const tr = t();
  const choice = await ui.select(tr.selectApiType, [...PI_APIS]);
  return (choice as PiApi | undefined) ?? undefined;
}

/**
 * Collect a shared base URL + api type once, then loop: each iteration gets a
 * different apiKey (for a different model group on the same relay), fetches
 * the catalog, and lets the user select models.
 *
 * Because Pi's schema only supports provider-level apiKey (not model-level),
 * each key+model-group is written as a separate provider entry: the wizard
 * appends a suffix to the provider name (e.g. QQ, QQ-2, QQ-3).
 */
async function collectGroups(
  ui: PimUi,
  baseName: string,
  api: PiApi,
  baseUrl: string,
  userAgent: boolean,
  existingIds: Set<string>,
): Promise<Array<{ providerSuffix: string; apiKey: string; drafts: ModelDraft[] }> | undefined> {
  const tr = t();
  const groups: Array<{ providerSuffix: string; apiKey: string; drafts: ModelDraft[] }> = [];
  let groupIndex = 0;

  while (true) {
    groupIndex++;
    const suffix = groupIndex === 1 ? "" : `-${groupIndex}`;
    const keyTitle = groupIndex === 1
      ? tr.secretApiKey
      : `${tr.groupTitle(groupIndex)} — ${tr.secretApiKey}`;
    const apiKey = await ui.secret(keyTitle);
    if (!apiKey) {
      if (groups.length === 0) return undefined;
      break;
    }

    const drafts = await draftsForApi(ui, { api, baseUrl, userAgent }, apiKey, existingIds);
    if (drafts === undefined) return undefined;
    for (const d of drafts) existingIds.add(d.id);

    groups.push({ providerSuffix: suffix, apiKey, drafts });

    const more = await ui.confirm(tr.groupAnotherKey, tr.groupAnotherKeyMsg);
    if (!more) break;
  }

  return groups.length ? groups : undefined;
}

/**
 * Legacy multi-API path: different protocol + URL for the same provider.
 * Kept for the "Add API to existing provider" flow.
 */
async function collectApis(ui: PimUi): Promise<Array<{ api: PiApi; baseUrl: string; userAgent: boolean }> | undefined> {
  const tr = t();
  const apis: Array<{ api: PiApi; baseUrl: string; userAgent: boolean }> = [];
  while (true) {
    const api = await pickApi(ui);
    if (!api) {
      if (apis.length === 0) return undefined;
      break;
    }
    const raw = await ui.input(tr.inputBaseUrl, "https://example.com/v1");
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
    const ua = await ui.confirm(tr.confirmUserAgent, tr.confirmUserAgentMsg);
    apis.push({ api, baseUrl, userAgent: ua !== false });
    const more = await ui.confirm(tr.addAnotherApi, tr.addAnotherApiMsg(apis.length));
    if (!more) break;
  }
  return apis.length ? apis : undefined;
}

export async function draftsForApi(
  ui: PimUi,
  spec: { api: PiApi; baseUrl: string; userAgent: boolean },
  apiKey: string,
  existingIds: Set<string>,
): Promise<ModelDraft[] | undefined> {
  const tr = t();
  const catalog = await ui.loader(
    tr.fetchingModels(spec.api, spec.baseUrl),
    (signal) => fetchCatalog({ api: spec.api, baseUrl: spec.baseUrl, apiKey, signal, userAgent: spec.userAgent }),
    null,
  );
  if (catalog === null) return undefined;

  let items = catalog.ok ? catalog.items : [];
  if (!catalog.ok) {
    ui.notify(catalog.error ?? tr.catalogFailed, "warning");
    if (catalog.html && catalog.suggestV1) {
      ui.notify(tr.htmlSuggestV1(catalog.suggestV1), "warning");
    }
  }

  if (items.length === 0) {
    if (catalog.ok) ui.notify(tr.noModelsReturned, "warning");
    const typed = await ui.input(tr.inputManualIds, "claude-opus-5, gpt-5.6-sol");
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
      description: `${existingIds.has(d.id) ? `${tr.conflictLabel}  ` : ""}${matchLabel(d.match)}  ${d.contextWindow}/${d.maxTokens}`,
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
      tr.lookingUp(unknownSelected.length),
      (signal) =>
        enrichUnknownDrafts(pickedItems, spec.api, spec.baseUrl, unknownSelected, {
          userAgent: spec.userAgent,
          signal,
        }),
      { drafts },
    );
    drafts = enriched.drafts.filter((d) => selected.includes(d.id));
    if (enriched.remote?.warning) ui.notify(enriched.remote.warning, "warning");
    else if (enriched.remote?.fetchedAt) ui.notify(tr.modelsDevCatalog(enriched.remote.fetchedAt), "info");
  }

  const out: ModelDraft[] = [];
  for (const draft of drafts) {
    if (draft.match.kind === "fuzzy") {
      const accepted = await ui.confirm(
        tr.confirmFuzzyTitle,
        tr.confirmFuzzyMsg(draft.id, draft.match.bucket!, draft.match.officialId!),
      );
      if (!accepted) continue;
    }
    if (!existingIds.has(draft.id)) {
      out.push(draft);
      continue;
    }
    const choice = await ui.select(tr.idExistsTitle(draft.id), [
      tr.idExistsKeep,
      tr.idExistsReplace,
      tr.idExistsSkip,
    ]);
    if (choice === tr.idExistsReplace) out.push({ ...draft, replaceExisting: true });
  }
  return maybeEditDrafts(ui, out);
}

export async function persist(
  ctx: CmdCtx,
  ui: PimUi,
  file: ModelsFile,
  providerId: string,
  apiKey: string | undefined,
  drafts: ModelDraft[],
  mode: "merge" | "replace-endpoint",
  pi?: { setModel: (model: unknown) => Promise<boolean> },
): Promise<void> {
  const tr = t();
  if (drafts.length === 0) {
    ui.notify(tr.nothingToWrite, "warning");
    return;
  }
  if (drafts.some((d) => !d.api || !d.baseUrl)) {
    ui.notify(tr.errDraftMissingEndpoint, "error");
    return;
  }
  const summary = drafts
    .map((d) => `${d.id}  ${d.api}`)
    .slice(0, 12)
    .join("\n");
  const ok = await ui.confirm(tr.confirmWriteTitle, `${tr.confirmWriteMsg(drafts.length, providerId)}\n${summary}`);
  if (!ok) return;

  const merged = applyDrafts(file, { providerId, apiKey, drafts, mode });
  const { backupPath } = await writeModelsFile(merged.file);
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ui.notify(tr.refreshFailed(err, backupPath), "error");
    const restore = await ui.confirm(
      tr.confirmRollback,
      backupPath ? tr.confirmRollbackRestore(backupPath) : tr.confirmRollbackRemove,
    );
    if (restore) {
      await rollbackModelsFile(backupPath);
      await ctx.modelRegistry.refresh();
      const rollbackError = ctx.modelRegistry.getError();
      ui.notify(rollbackError ? tr.rollbackRefreshFailed(rollbackError) : tr.rolledBack, rollbackError ? "error" : "info");
    }
    return;
  }
  const apis = [...new Set(drafts.map((d) => d.api))].join(", ");
  const conflictNote = merged.skippedConflicts.length;
  ui.notify(tr.addedModels(merged.added, merged.replaced, providerId, apis, conflictNote), "info");
  if (merged.sunkThinking) {
    ui.notify(tr.sunkThinkingMsg, "info");
  }
  await writeSidecar({
    lastProvider: providerId,
    lastEndpoints: drafts.map((d) => ({ provider: providerId, api: d.api, baseUrl: d.baseUrl })),
  });
  const first = drafts[0];
  if (first && pi) {
    const jump = await ui.confirm(tr.confirmSwitchModel, tr.confirmSwitchModelMsg(providerId, first.id));
    if (jump) {
      const model = ctx.modelRegistry.find(providerId, first.id);
      const okSwitch = model ? await pi.setModel(model) : false;
      if (!okSwitch) ui.notify(tr.setModelFailed, "warning");
    }
  }
}

async function wizardNew(ctx: CmdCtx, ui: PimUi, file: ModelsFile, pi: { setModel: Function }): Promise<void> {
  const tr = t();
  const name = await ui.input(tr.inputProviderName, "ELY");
  if (!name) return;
  if (!providerNameOk(name)) {
    ui.notify(tr.errNameFormat, "error");
    return;
  }
  if (clashesBuiltin(name)) {
    const go = await ui.confirm(tr.builtinName, tr.builtinNameConfirm(name));
    if (!go) return;
  }

  // Step 1: pick api type + baseUrl once (shared across all groups)
  const api = await pickApi(ui);
  if (!api) return;
  const raw = await ui.input(tr.inputBaseUrl, "https://example.com/v1");
  if (!raw) return;
  let baseUrl: string;
  try {
    baseUrl = canonicalizeUrl(raw);
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), "error");
    return;
  }
  const userAgent = (await ui.confirm(tr.confirmUserAgent, tr.confirmUserAgentMsg)) !== false;

  // Step 2: loop over groups — each group has its own apiKey + selected models
  const existing = new Set<string>();
  const groups = await collectGroups(ui, name, api, baseUrl, userAgent, existing);
  if (!groups) return;

  // Write each group as a separate provider (name, name-2, name-3, …)
  for (const group of groups) {
    const providerId = `${name}${group.providerSuffix}`;
    if (file.providers[providerId]) {
      const go = await ui.confirm(tr.existsMerge, tr.existsMergeMsg(providerId));
      if (!go) continue;
    }
    await persist(ctx, ui, file, providerId, group.apiKey, group.drafts, "merge", pi);
  }
}

async function wizardAddApi(ctx: CmdCtx, ui: PimUi, file: ModelsFile, pi: { setModel: Function }): Promise<void> {
  const tr = t();
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.noProvidersCreateFirst, "warning");
    return;
  }
  const name = await ui.select(tr.selectProvider, names);
  if (!name) return;
  const provider = file.providers[name];
  const apiKey =
    (provider?.apiKey && !provider.apiKey.startsWith("$") && !provider.apiKey.startsWith("!")
      ? provider.apiKey
      : undefined) ?? (await ui.secret(tr.secretApiKeyFor(name)));
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

  const modeChoice = await ui.select(tr.applyHowTitle, [tr.applyHowMerge, tr.applyHowReplace, tr.applyHowCancel]);
  if (!modeChoice || modeChoice === tr.applyHowCancel) return;
  const mode = modeChoice === tr.applyHowReplace ? "replace-endpoint" : "merge";
  await persist(ctx, ui, file, name, provider?.apiKey ? undefined : apiKey, all, mode, pi);
}

async function wizardRefreshCache(ui: PimUi): Promise<void> {
  const tr = t();
  const result = await ui.loader(
    tr.refreshingCache,
    async (signal) => {
      const remote = await loadOfficialCatalog({ force: true, signal });
      return remote.warning ?? tr.refreshingCacheResult(Object.keys(remote.catalog).length, remote.fetchedAt ?? "unknown time");
    },
    tr.cacheCancelled,
  );
  ui.notify(String(result), "info");
}

async function wizardViewProviders(ui: PimUi, ctx: CmdCtx): Promise<void> {
  const tr = t();
  const file = await readModelsFile();
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.viewNoProviders, "warning");
    return;
  }

  while (true) {
    const options = names.map((n) => tr.viewProviderLabel(n, file.providers[n]?.models?.length ?? 0));
    options.push(tr.viewDeleteProvider);
    options.push(tr.viewBack);

    const choice = await ui.select(tr.viewTitle, options);
    if (!choice || choice === tr.viewBack) return;

    if (choice === tr.viewDeleteProvider) {
      await runManageMenu(ui, ctx);
      // Re-read after potential modifications
      const refreshed = await readModelsFile();
      const newNames = listExistingProviders(refreshed);
      if (newNames.length === 0) return;
      // Update names for next loop iteration
      names.length = 0;
      names.push(...newNames);
      // Rebuild file reference
      Object.assign(file, refreshed);
      continue;
    }

    // Find the provider that was selected
    const idx = options.indexOf(choice);
    if (idx < 0 || idx >= names.length) continue;
    const providerName = names[idx];
    const provider = file.providers[providerName];
    const models = provider?.models ?? [];

    if (models.length === 0) {
      ui.notify(tr.viewNoModels(providerName), "warning");
      continue;
    }

    // Show models for this provider, allow deletion
    const modelOptions = models.map((m) => `${m.id}  ${m.api ?? provider?.api ?? "?"}  ${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`);
    modelOptions.push(tr.viewDeleteModels);
    modelOptions.push(tr.viewBack);

    const modelChoice = await ui.select(`${providerName}`, modelOptions);
    if (!modelChoice || modelChoice === tr.viewBack) continue;

    if (modelChoice === tr.viewDeleteModels) {
      // Delegate to the manage delete-models flow but pre-select this provider
      await wizardDeleteModelsForProvider(ui, ctx, file, providerName);
      // Re-read
      const refreshed = await readModelsFile();
      Object.assign(file, refreshed);
    }
  }
}

async function wizardDeleteModelsForProvider(ui: PimUi, ctx: CmdCtx, file: ModelsFile, name: string): Promise<void> {
  const tr = t();
  const provider = file.providers[name];
  const models = provider?.models ?? [];
  if (models.length === 0) {
    ui.notify(tr.viewNoModels(name), "warning");
    return;
  }
  const selected = await ui.multiSelect(
    tr.deleteModelsTitle(name),
    models.map((m) => ({
      value: m.id,
      label: m.id,
      description: `${m.api ?? provider?.api ?? "?"}  ${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`,
    })),
  );
  if (!selected || selected.length === 0) return;
  const ok = await ui.confirm(tr.confirmDeleteModels, tr.confirmDeleteModelsMsg(selected.length, name, selected));
  if (!ok) return;

  const { writeProviderBackup, deleteModels, writeModelsFile, rollbackModelsFile } = await import("./models-json.ts");
  await writeProviderBackup(file, name);
  const nextFile = deleteModels(file, name, selected);
  const { backupPath } = await writeModelsFile(nextFile);
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ui.notify(tr.refreshFailed(err, backupPath), "error");
    const restore = await ui.confirm(
      tr.confirmRollback,
      backupPath ? tr.confirmRollbackRestore(backupPath) : tr.confirmRollbackRemove,
    );
    if (restore) {
      await rollbackModelsFile(backupPath);
      await ctx.modelRegistry.refresh();
      const rollbackError = ctx.modelRegistry.getError();
      ui.notify(rollbackError ? tr.rollbackRefreshFailed(rollbackError) : tr.rolledBack, rollbackError ? "error" : "info");
    }
    return;
  }
  ui.notify(tr.deletedModels(selected.length, name), "info");
}

async function wizardSwitchLang(ui: PimUi): Promise<void> {
  const next = otherLang(getLang());
  await saveLang(next);
}

export async function runWizard(ctx: CmdCtx, pi: { setModel: Function }): Promise<void> {
  if (failNonTui(ctx)) return;
  await loadLang();
  const ui = createPimUi(ctx);
  const tr = t();

  const file = await readModelsFile();
  const action = await ui.select(tr.menuTitle, [
    tr.menuNew,
    tr.menuAdd,
    tr.menuManage,
    tr.menuView,
    tr.menuRefresh,
    tr.menuLang(getLang()),
    tr.menuCancel,
  ]);
  if (!action || action === tr.menuCancel) return;
  if (action === tr.menuNew) return wizardNew(ctx, ui, file, pi);
  if (action === tr.menuAdd) return wizardAddApi(ctx, ui, file, pi);
  if (action === tr.menuManage) return runManageMenu(ui, ctx);
  if (action === tr.menuView) return wizardViewProviders(ui, ctx);
  if (action === tr.menuRefresh) return wizardRefreshCache(ui);
  if (action === tr.menuLang(getLang())) return wizardSwitchLang(ui);
}

export type { WizardApi } from "./types.ts";
