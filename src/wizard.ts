import { fetchCatalog, parseManualIds } from "./catalog.ts";
import { isNonChatModality } from "./defaults.ts";
import { matchLabel } from "./match.ts";
import { loadOfficialCatalog } from "./models-dev.ts";
import {
  applyDrafts,
  clashesBuiltin,
  listExistingProviders,
  mutateModelsFile,
  providerNameOk,
  readModelsFile,
  rollbackModelsFile,
  type MergeMode,
} from "./models-json.ts";
import { runProvidersMenu, providerOptions } from "./manage.ts";
import { wizardTokenUsage } from "./usage-wizard.ts";
import { enrichUnknownDrafts, resolveDrafts } from "./resolve.ts";
import { canonicalizeUrl } from "./url.ts";
import { writeSidecar } from "./sidecar.ts";
import { readDefaultModelRef, readSettingsFile, writeDefaultModel } from "./settings.ts";
import { PI_APIS, type ModelDraft, type ModelsFile, type PiApi } from "./types.ts";
import { createPimUi, type PimOption, type PimUi } from "./ui/pim-ui.ts";
import { FOOTER_SELECT_EXIT } from "./ui/dialogs.ts";
import { maybeEditDrafts } from "./ui/edit-caps.ts";
import { langLabel, loadLang, getLang, saveLang, t } from "./i18n.ts";

/** The slice of the Pi session API the wizard uses to switch the active model. */
export type ModelSwitcher = {
  setModel: (model: import("@earendil-works/pi-ai").Model<any>) => Promise<boolean>;
};

export type CmdCtx = {
  mode: string;
  ui: {
    notify: (message: string, type?: "info" | "warning" | "error") => void;
    custom: Function;
  };
  modelRegistry: {
    refresh: () => Promise<unknown>;
    getError: () => string | undefined;
    find: (provider: string, id: string) => import("@earendil-works/pi-ai").Model<any> | undefined;
    getApiKeyForProvider?: (providerId: string) => Promise<string | undefined> | string | undefined;
    getProvider?: (id: string) => import("@earendil-works/pi-ai").Provider | undefined;
    registerProvider?: (provider: import("@earendil-works/pi-ai").Provider) => void;
    unregisterProvider?: (id: string) => void;
  };
  /** Present in the real extension context; used to locate the live session dir. */
  sessionManager?: { getSessionDir?: () => string };
};

function failNonTui(ctx: CmdCtx): boolean {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(t().errInteractiveOnly, "error");
    return true;
  }
  return false;
}

const NEW_STEPS = 5;

async function pickApi(ui: PimUi, subtitle?: string): Promise<PiApi | undefined> {
  const tr = t();
  const choice = await ui.select(
    tr.selectApiType,
    PI_APIS.map((api) => ({ value: api, label: api, description: tr.apiTypeDescription(api) })),
    subtitle,
  );
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
  let nextIndex = 1;

  while (true) {
    const groupIndex = nextIndex;
    const suffix = groupIndex === 1 ? "" : `-${groupIndex}`;
    const keyTitle = groupIndex === 1
      ? tr.secretApiKey
      : `${tr.groupTitle(groupIndex)} — ${tr.secretApiKey}`;
    const apiKey = await ui.secret(keyTitle, {
      subtitle: `${t().stepLabel(5, NEW_STEPS, t().stepApiKey)} · ${baseName} · ${api}`,
    });
    if (!apiKey) {
      if (groups.length === 0) return undefined;
      break;
    }

    const drafts = await draftsForApi(ui, { api, baseUrl, userAgent }, apiKey, existingIds);
    if (drafts === undefined) continue;
    for (const d of drafts) existingIds.add(d.id);

    groups.push({ providerSuffix: suffix, apiKey, drafts });
    nextIndex++;

    const more = await ui.confirm(tr.groupAnotherKey, tr.groupAnotherKeyMsg);
    if (more !== true) break;
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
    if (!api) return apis.length ? apis : undefined;

    let baseUrl: string | undefined;
    let userAgent: boolean | undefined;
    while (userAgent === undefined) {
      if (!baseUrl) {
        const raw = await ui.input(tr.inputBaseUrl, "https://example.com/v1");
        if (!raw) break;
        try {
          baseUrl = canonicalizeUrl(raw);
        } catch (error) {
          ui.notify(error instanceof Error ? error.message : String(error), "error");
          continue;
        }
      }
      const ua = await ui.confirm(tr.confirmUserAgent, tr.confirmUserAgentMsg);
      if (ua === undefined) {
        baseUrl = undefined;
        continue;
      }
      userAgent = ua !== false;
    }
    if (!baseUrl || userAgent === undefined) continue;

    apis.push({ api, baseUrl, userAgent });
    const more = await ui.confirm(tr.addAnotherApi, tr.addAnotherApiMsg(apis.length));
    if (more !== true) break;
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
    if (typed === undefined) return undefined;
    if (!typed.trim()) return [];
    items = parseManualIds(typed).map((id) => ({ id }));
  }

  const preview = resolveDrafts(items, spec.api, spec.baseUrl, { userAgent: spec.userAgent });
  const orderedDrafts = [...preview.drafts].sort((a, b) => {
    const rank = (kind: ModelDraft["match"]["kind"]) => kind === "official" ? 0 : kind === "fuzzy" ? 1 : 2;
    return rank(a.match.kind) - rank(b.match.kind) || a.id.localeCompare(b.id);
  });
  const selectItems = orderedDrafts.map((d) => ({
    value: d.id,
    label: d.id,
    description: `${existingIds.has(d.id) ? `${tr.conflictLabel}  ` : ""}${matchLabel(d.match)}  ${d.contextWindow}/${d.maxTokens}`,
    hiddenByDefault: isNonChatModality(d.id, d.match.official),
    checked: d.match.kind === "official" && !existingIds.has(d.id),
  }));

  while (true) {
    const selected = await ui.multiSelect(`${spec.api} @ ${spec.baseUrl}`, selectItems);
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
    let back = false;
    for (const draft of drafts) {
      if (draft.match.kind === "fuzzy") {
        const accepted = await ui.confirm(
          tr.confirmFuzzyTitle,
          tr.confirmFuzzyMsg(draft.id, draft.match.bucket!, draft.match.officialId!),
        );
        if (accepted === undefined) {
          back = true;
          break;
        }
        if (!accepted) continue;
      }
      if (!existingIds.has(draft.id)) {
        out.push(draft);
        continue;
      }
      const choice = await ui.select(tr.idExistsTitle(draft.id), [
        { value: "keep", label: tr.idExistsKeep },
        { value: "replace", label: tr.idExistsReplace },
        { value: "skip", label: tr.idExistsSkip },
      ]);
      if (!choice) {
        back = true;
        break;
      }
      if (choice === "replace") out.push({ ...draft, replaceExisting: true });
    }
    if (back) continue;

    const edited = await maybeEditDrafts(ui, out);
    if (edited === undefined) continue;
    return edited;
  }
}

export async function persist(
  ctx: CmdCtx,
  ui: PimUi,
  _file: ModelsFile,
  providerId: string,
  apiKey: string | undefined,
  drafts: ModelDraft[],
  mode: MergeMode,
  pi?: ModelSwitcher,
  replace?: Array<{ api: string; baseUrl: string }>,
): Promise<ModelsFile | undefined> {
  const tr = t();
  const replacing = mode === "replace-endpoint" && (replace?.length ?? 0) > 0;
  if (drafts.length === 0 && !replacing) {
    ui.notify(tr.nothingToWrite, "warning");
    return undefined;
  }
  if (drafts.some((d) => !d.api || !d.baseUrl)) {
    ui.notify(tr.errDraftMissingEndpoint, "error");
    return undefined;
  }
  const LIMIT = 12;
  const rows = drafts.length
    ? drafts.map((d) => `${d.id}  ${d.api}  ${d.baseUrl ?? ""}`)
    : (replace ?? []).map((r) => `${r.api}  ${r.baseUrl}`);
  const summary = rows.slice(0, LIMIT).join("\n");
  // Tell the user how many rows were hidden, and which mode will be written.
  const more = rows.length > LIMIT ? `\n${tr.confirmWriteMore(rows.length - LIMIT)}` : "";
  const header = [
    tr.confirmWriteMsg(drafts.length, providerId),
    tr.confirmWriteMode(mode === "replace-endpoint" ? tr.applyHowReplace : tr.applyHowMerge),
    drafts[0]?.baseUrl ? `${tr.stepBaseUrl}: ${drafts[0].baseUrl}` : "",
  ].filter(Boolean).join("\n");
  const ok = await ui.confirm(tr.confirmWriteTitle, `${header}\n\n${summary}${more}`);
  if (ok !== true) return undefined;

  let merged!: ReturnType<typeof applyDrafts>;
  const { file, backupPath } = await mutateModelsFile((current) => {
    const persistKey = current.providers[providerId]?.apiKey ? undefined : apiKey;
    merged = applyDrafts(current, { providerId, apiKey: persistKey, drafts, mode, replace });
    return merged.file;
  });
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ui.notify(tr.refreshFailed(err, backupPath), "error");
    const restore = await ui.confirm(
      tr.confirmRollback,
      backupPath ? tr.confirmRollbackRestore(backupPath) : tr.confirmRollbackRemove,
      { danger: true },
    );
    if (restore === true) {
      await rollbackModelsFile(backupPath);
      await ctx.modelRegistry.refresh();
      const rollbackError = ctx.modelRegistry.getError();
      ui.notify(rollbackError ? tr.rollbackRefreshFailed(rollbackError) : tr.rolledBack, rollbackError ? "error" : "info");
    }
    return undefined;
  }
  const apis = [...new Set([
    ...drafts.map((d) => d.api),
    ...(replace ?? []).map((r) => r.api),
  ])].join(", ");
  const conflictNote = merged.skippedConflicts.length;
  ui.notify(tr.addedModels(merged.added, merged.replaced, providerId, apis, conflictNote), "info");
  if (merged.sunkThinking) {
    ui.notify(tr.sunkThinkingMsg, "info");
  }
  await writeSidecar({
    lastProvider: providerId,
    lastEndpoints: (replace ?? drafts).map((d) => ({ provider: providerId, api: d.api, baseUrl: d.baseUrl })),
  });
  const first = drafts[0];
  if (first && pi) {
    const jump = await ui.confirm(tr.confirmSwitchModel, tr.confirmSwitchModelMsg(providerId, first.id));
    if (jump === true) {
      const model = ctx.modelRegistry.find(providerId, first.id);
      const okSwitch = model ? await pi.setModel(model) : false;
      if (!okSwitch) ui.notify(tr.setModelFailed, "warning");
    }
  }
  return file;
}

export async function wizardNew(ctx: CmdCtx, ui: PimUi, file: ModelsFile, pi: ModelSwitcher): Promise<void> {
  const tr = t();
  let name: string | undefined;
  let api: PiApi | undefined;
  let baseUrl: string | undefined;
  let userAgent: boolean | undefined;
  const step = (n: number, what: string) => tr.stepLabel(n, NEW_STEPS, what);

  while (true) {
    if (!name) {
      const typed = await ui.input(tr.inputProviderName, "ELY", { initial: "", subtitle: step(1, tr.stepName) });
      if (!typed) return;
      if (!providerNameOk(typed)) {
        ui.notify(tr.errNameFormat, "error");
        continue;
      }
      if (clashesBuiltin(typed)) {
        const go = await ui.confirm(tr.builtinName, tr.builtinNameConfirm(typed), { danger: true });
        if (go !== true) continue;
      }
      name = typed;
      continue;
    }

    if (!api) {
      api = await pickApi(ui, `${step(2, tr.stepApi)}${name ? ` · ${name}` : ""}`);
      if (!api) {
        name = undefined;
        continue;
      }
      continue;
    }

    if (!baseUrl) {
      const raw = await ui.input(tr.inputBaseUrl, "https://example.com/v1", {
        subtitle: `${step(3, tr.stepBaseUrl)} · ${name} · ${api}`,
      });
      if (!raw) {
        api = undefined;
        continue;
      }
      try {
        baseUrl = canonicalizeUrl(raw);
      } catch (error) {
        ui.notify(error instanceof Error ? error.message : String(error), "error");
        continue;
      }
      continue;
    }

    if (userAgent === undefined) {
      const ua = await ui.confirm(
        tr.confirmUserAgent,
        `${step(4, tr.stepUserAgent)}\n${name} · ${api} · ${baseUrl}\n\n${tr.confirmUserAgentMsg}`,
      );
      if (ua === undefined) {
        baseUrl = undefined;
        continue;
      }
      userAgent = ua !== false;
      continue;
    }

    // Step 5: loop over groups — each group has its own apiKey + selected models.
    // ESC on the first key returns to the User-Agent prompt.
    const existing = new Set<string>();
    const groups = await collectGroups(ui, name, api, baseUrl, userAgent, existing);
    if (!groups) {
      userAgent = undefined;
      continue;
    }

    // Write each group as a separate provider (name, name-2, name-3, …).
    // persist() re-reads models.json under the write lock, so later groups
    // always merge onto disk state instead of an earlier in-memory snapshot.
    let current = await readModelsFile();
    for (const group of groups) {
      const providerId = `${name}${group.providerSuffix}`;
      if (current.providers[providerId]) {
        const go = await ui.confirm(tr.existsMerge, tr.existsMergeMsg(providerId));
        if (go !== true) {
          ui.notify(tr.groupSkipped(providerId), "warning");
          continue;
        }
      }
      const persistKey = current.providers[providerId]?.apiKey ? undefined : group.apiKey;
      const next = await persist(ctx, ui, current, providerId, persistKey, group.drafts, "merge", pi);
      if (next) current = next;
    }
    return;
  }
}

function catalogApiKey(provider: { apiKey?: string } | undefined): string | undefined {
  const key = provider?.apiKey;
  if (!key || key.startsWith("$") || key.startsWith("!")) return undefined;
  return key;
}

function upsertDraft(list: ModelDraft[], draft: ModelDraft): void {
  const idx = list.findIndex((item) => item.id === draft.id);
  if (idx >= 0) list[idx] = draft;
  else list.push(draft);
}

/**
 * Add API / models. `providerName` skips the provider picker when the caller
 * already knows which provider it is (the provider hub does).
 */
export async function wizardAddApi(
  ctx: CmdCtx,
  ui: PimUi,
  file: ModelsFile,
  pi: ModelSwitcher,
  providerName?: string,
): Promise<void> {
  const tr = t();
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.noProvidersCreateFirst, "warning");
    return;
  }

  while (true) {
    const name = providerName ?? await ui.select(tr.selectProvider, await providerOptions(file));
    if (!name) return;
    providerName = undefined;
    const provider = file.providers[name];
    const storedKey = catalogApiKey(provider);
    let catalogKey = storedKey;

    while (true) {
      if (!catalogKey) {
        catalogKey = await ui.secret(tr.secretApiKeyFor(name));
        if (!catalogKey) break;
      }

      const specs = await collectApis(ui);
      if (!specs) {
        if (storedKey) break;
        catalogKey = undefined;
        continue;
      }

      const existing = new Set((provider?.models ?? []).map((m) => m.id));
      const all: ModelDraft[] = [];
      let cancelled = false;
      for (const spec of specs) {
        const drafts = await draftsForApi(ui, spec, catalogKey, existing);
        if (drafts === undefined) {
          cancelled = true;
          break;
        }
        for (const d of drafts) {
          upsertDraft(all, d);
          existing.add(d.id);
        }
      }
      if (cancelled) continue;

      const modeChoice = await ui.select(tr.applyHowTitle, [
        { value: "merge", label: tr.applyHowMerge, description: tr.applyHowMergeDesc },
        { value: "replace", label: tr.applyHowReplace, description: tr.applyHowReplaceDesc },
        { value: "cancel", label: tr.applyHowCancel, description: tr.applyHowCancelDesc },
      ]);
      if (!modeChoice || modeChoice === "cancel") {
        // Cancelling here used to throw away the catalog selection and the
        // typed key without a word; go back to picking a provider instead.
        ui.notify(tr.applyHowDiscarded(all.length), "warning");
        return;
      }
      const mode = modeChoice === "replace" ? "replace-endpoint" : "merge";
      const persistKey = provider?.apiKey ? undefined : catalogKey;
      await persist(ctx, ui, file, name, persistKey, all, mode, pi, specs.map((spec) => ({ api: spec.api, baseUrl: spec.baseUrl })));
      return;
    }
    if (providerName) return;
  }
}

/** Entry point for the provider hub: add endpoints/models to one provider. */
export async function wizardAddApiFor(ctx: CmdCtx, ui: PimUi, providerName: string): Promise<void> {
  await wizardAddApi(ctx, ui, await readModelsFile(), (ctx as unknown as { pi?: { setModel: Function } }).pi ?? {
    setModel: async () => false,
  }, providerName);
}

async function wizardRefreshCache(ui: PimUi): Promise<void> {
  const tr = t();
  const result = await ui.loader(
    tr.refreshingCache,
    async (signal) => {
      const remote = await loadOfficialCatalog({ force: true, signal });
      return remote.warning ?? tr.refreshingCacheResult(Object.keys(remote.catalog).length, remote.fetchedAt ?? tr.unknownTime);
    },
    tr.cacheCancelled,
  );
  ui.notify(String(result), "info");
}

/** Language submenu: explicit rows with a marker, instead of a blind toggle. */
async function wizardSwitchLang(ui: PimUi): Promise<void> {
  const tr = t();
  const current = getLang();
  const choice = await ui.select(
    tr.languageTitle,
    [
      { value: "en", label: langLabel("en"), description: current === "en" ? tr.languageCurrent : "" },
      { value: "zh", label: langLabel("zh"), description: current === "zh" ? tr.languageCurrent : "" },
    ],
    undefined,
    undefined,
    { initialValue: current, filterable: false },
  );
  if (!choice || choice === current) return;
  await saveLang(choice === "zh" ? "zh" : "en");
  ui.notify(langLabel(choice === "zh" ? "zh" : "en"), "info");
}

async function runSettingsMenu(ui: PimUi): Promise<void> {
  while (true) {
    const tr = t();
    const action = await ui.select(tr.settingsTitle, [
      { value: "lang", label: tr.settingsLanguage, description: tr.settingsLanguageDesc(langLabel(getLang())) },
      { value: "cache", label: tr.settingsCache, description: tr.settingsCacheDesc },
      { value: "back", label: tr.settingsBack },
    ]);
    if (!action || action === "back") return;
    if (action === "lang") await wizardSwitchLang(ui);
    else if (action === "cache") await wizardRefreshCache(ui);
  }
}

/** Default-model picker, optionally scoped to one provider (provider hub). */
export async function wizardSwitchDefault(
  ctx: CmdCtx,
  ui: PimUi,
  pi: ModelSwitcher,
  providerName?: string,
): Promise<void> {
  const tr = t();
  const file = await readModelsFile();
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.noProvidersInFile, "warning");
    return;
  }
  if (names.every((name) => (file.providers[name]?.models?.length ?? 0) === 0)) {
    ui.notify(tr.noModelsAnywhere, "warning");
    return;
  }

  const current = readDefaultModelRef(await readSettingsFile());
  const subtitle = current
    ? tr.defaultModelCurrent(current.provider, current.model)
    : tr.defaultModelUnset;

  while (true) {
    const name = providerName ?? await ui.select(tr.selectProvider, await providerOptions(file), subtitle);
    if (!name) return;
    providerName = undefined;

    const provider = file.providers[name];
    const models = provider?.models ?? [];
    if (models.length === 0) {
      ui.notify(tr.noModels(name), "warning");
      continue;
    }

    const options: PimOption[] = models.map((m) => {
      const isCurrent = current?.provider === name && current.model === m.id;
      return {
        value: m.id,
        label: m.id,
        description: isCurrent
          ? `* ${tr.languageCurrent}`
          : [m.name && m.name !== m.id ? m.name : "", `${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`]
            .filter(Boolean).join("  "),
      };
    });
    const choice = await ui.select(tr.selectDefaultModel, options, subtitle, undefined, {
      initialValue: current?.provider === name ? current.model : undefined,
    });
    if (!choice) continue;
    if (current?.provider === name && current.model === choice) {
      ui.notify(tr.switchedDefault(name, choice), "info");
      return;
    }

    const ok = await ui.confirm(tr.confirmSetDefault, tr.confirmSetDefaultMsg(name, choice));
    if (ok !== true) continue;

    try {
      await writeDefaultModel(name, choice);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ui.notify(`${tr.setDefaultFailed}\n${message}`, "error");
      return;
    }
    ui.notify(tr.switchedDefault(name, choice), "info");

    const model = ctx.modelRegistry.find(name, choice);
    const okSwitch = model ? await pi.setModel(model) : false;
    if (!okSwitch) ui.notify(tr.setModelFailed, "warning");
    return;
  }
}

/** Provider hub entry point: set the default model within one provider. */
export async function wizardSetDefaultForProvider(
  ctx: CmdCtx,
  ui: PimUi,
  providerName: string,
): Promise<void> {
  await wizardSwitchDefault(ctx, ui, ctx as unknown as { setModel: (model: unknown) => Promise<boolean> }, providerName);
}

export function mainMenuOptions(): string[] {
  const tr = t();
  return [
    tr.menuProviders,
    tr.menuSwitchDefault,
    tr.menuNew,
    tr.menuAdd,
    tr.menuUsage,
    tr.menuSettings,
    tr.menuExit,
  ];
}

/** Same rows as `mainMenuOptions()`, with the one-line hint shown next to each. */
export function mainMenuItems(): PimOption[] {
  const tr = t();
  return [
    { value: "providers", label: tr.menuProviders, description: tr.menuProvidersDesc },
    { value: "switchDefault", label: tr.menuSwitchDefault, description: tr.menuSwitchDefaultDesc },
    { value: "new", label: tr.menuNew, description: tr.menuNewDesc },
    { value: "add", label: tr.menuAdd, description: tr.menuAddDesc },
    { value: "usage", label: tr.menuUsage, description: tr.menuUsageDesc },
    { value: "settings", label: tr.menuSettings, description: tr.menuSettingsDesc },
    { value: "exit", label: tr.menuExit, description: tr.menuExitDesc },
  ];
}

/** Status line above the main menu: how much is configured right now. */
export async function mainMenuStatus(): Promise<string> {
  const tr = t();
  try {
    const file = await readModelsFile();
    const providers = listExistingProviders(file);
    const models = providers.reduce((sum, name) => sum + (file.providers[name]?.models?.length ?? 0), 0);
    const current = readDefaultModelRef(await readSettingsFile());
    return tr.menuStatus(providers.length, models, current ? `${current.provider}/${current.model}` : undefined);
  } catch {
    return tr.menuStatus(0, 0, undefined);
  }
}

export async function runMainMenu(ctx: CmdCtx, ui: PimUi, pi: ModelSwitcher): Promise<void> {
  while (true) {
    const subtitle = await mainMenuStatus();
    const action = await ui.select(
      t().menuTitle,
      mainMenuItems(),
      subtitle,
      FOOTER_SELECT_EXIT(),
      { filterable: false },
    );
    if (!action || action === "exit") return;
    if (action === "providers") {
      await runProvidersMenu(ui, ctx, pi as { setModel: (model: unknown) => Promise<boolean> });
      continue;
    }
    if (action === "switchDefault") {
      await wizardSwitchDefault(ctx, ui, pi as { setModel: (model: unknown) => Promise<boolean> });
      continue;
    }
    if (action === "new") {
      await wizardNew(ctx, ui, await readModelsFile(), pi);
      continue;
    }
    if (action === "add") {
      await wizardAddApi(ctx, ui, await readModelsFile(), pi);
      continue;
    }
    if (action === "usage") {
      await wizardTokenUsage(ui, ctx);
      continue;
    }
    if (action === "settings") {
      await runSettingsMenu(ui);
    }
  }
}

export async function runWizard(
  ctx: CmdCtx,
  pi: ModelSwitcher,
  start: "menu" | "new" = "menu",
): Promise<void> {
  if (failNonTui(ctx)) return;
  await loadLang();
  const ui = createPimUi(ctx);
  // `/add-provider` jumps straight into creation; everything else opens the menu.
  if (start === "new") {
    await wizardNew(ctx, ui, await readModelsFile(), pi);
    return;
  }
  await runMainMenu(ctx, ui, pi);
}

export type { WizardApi } from "./types.ts";
