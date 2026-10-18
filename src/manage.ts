import { fetchCatalog } from "./catalog.ts";
import { isNonChatModality } from "./defaults.ts";
import {
  applyDrafts,
  deleteModels,
  deleteProvider,
  draftToRecord,
  listExistingProviders,
  mutateModelsFile,
  readModelsFile,
  replaceModelRecords,
  rollbackModelsFile,
  writeProviderBackup,
} from "./models-json.ts";
import { planRefresh, providerEndpoints, refreshAdds, type EndpointRef } from "./refresh-plan.ts";
import { resolveDrafts } from "./resolve.ts";
import { recordToDraft } from "./caps.ts";
import { readSidecar } from "./sidecar.ts";
import { editDraft } from "./ui/edit-caps.ts";
import type { PimOption, PimUi } from "./ui/pim-ui.ts";
import type { ModelsFile, PiApi, ProviderRecord } from "./types.ts";
import { isHidden, setProviderHidden, applyVisibility, type VisibilityRegistry } from "./visibility.ts";
import { t } from "./i18n.ts";

export type RegistryCtx = {
  modelRegistry: {
    refresh: () => Promise<unknown>;
    getError: () => string | undefined;
    getApiKeyForProvider?: (providerId: string) => Promise<string | undefined> | string | undefined;
  } & Partial<VisibilityRegistry>;
};

/**
 * Write + refresh + rollback-on-error, shared by every manage/view flow.
 * Returns the persisted file (disk state) so callers can continue from it,
 * or undefined when pi rejected the config (rolled back).
 */
export async function persistFile(
  ui: PimUi,
  ctx: RegistryCtx,
  mutate: (file: ModelsFile) => ModelsFile,
  message: string,
): Promise<ModelsFile | undefined> {
  const tr = t();
  const { file, backupPath } = await mutateModelsFile(mutate);
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
  ui.notify(message, "info");
  return file;
}

/** Provider rows for any picker: the value is the provider id, the label is the id. */
export async function providerOptions(file: ModelsFile, hidden?: ReadonlySet<string>): Promise<PimOption[]> {
  const tr = t();
  const sidecarHidden = hidden ?? new Set((await readSidecar()).hiddenProviders ?? []);
  return listExistingProviders(file).map((name) => {
    const provider = file.providers[name];
    const count = provider?.models?.length ?? 0;
    return {
      value: name,
      label: name,
      description: tr.providerStatus(count, provider?.api ?? "?", sidecarHidden.has(name)),
    };
  });
}

/** Ask which provider to act on. Returns the provider id, never a display label. */
export async function pickProvider(
  ui: PimUi,
  file: ModelsFile,
  subtitle?: string,
): Promise<string | undefined> {
  const tr = t();
  const options = await providerOptions(file);
  if (options.length === 0) {
    ui.notify(tr.noProvidersInFile, "warning");
    return undefined;
  }
  return ui.select(tr.selectProvider, options, subtitle);
}

async function visibilityOf(ctx: RegistryCtx): Promise<VisibilityRegistry | undefined> {
  const registry = ctx.modelRegistry;
  if (!registry.getProvider || !registry.registerProvider || !registry.unregisterProvider) return undefined;
  return {
    getProvider: registry.getProvider,
    registerProvider: registry.registerProvider,
    unregisterProvider: registry.unregisterProvider,
  };
}

async function refreshVisibility(ctx: RegistryCtx): Promise<void> {
  const registry = await visibilityOf(ctx);
  if (registry) await applyVisibility(registry);
}

export async function wizardBackupProvider(ui: PimUi, file: ModelsFile, providerName?: string): Promise<void> {
  const tr = t();
  const name = providerName ?? await pickProvider(ui, file);
  if (!name) return;
  const path = await writeProviderBackup(file, name);
  ui.notify(tr.backedUpProvider(name, path), "info");
}

export async function wizardDeleteProvider(
  ui: PimUi,
  ctx: RegistryCtx,
  file: ModelsFile,
  providerName?: string,
): Promise<void> {
  const tr = t();
  const name = providerName ?? await pickProvider(ui, file);
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ui.confirm(
    tr.confirmDeleteProvider,
    tr.confirmDeleteProviderMsg(name, count),
    { danger: true },
  );
  if (ok !== true) return;
  const backup = await writeProviderBackup(file, name);
  await persistFile(ui, ctx, (current) => deleteProvider(current, name), tr.deletedProvider(name, backup));
}

export async function wizardDeleteModels(
  ui: PimUi,
  ctx: RegistryCtx,
  file: ModelsFile,
  providerName?: string,
): Promise<void> {
  const tr = t();
  const name = providerName ?? await pickProvider(ui, file);
  if (!name) return;
  const provider = file.providers[name];
  const models = provider?.models ?? [];
  if (models.length === 0) {
    ui.notify(tr.noModels(name), "warning");
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
  const ok = await ui.confirm(
    tr.confirmDeleteModels,
    tr.confirmDeleteModelsMsg(selected.length, name, selected),
    { danger: true },
  );
  if (ok !== true) return;
  await writeProviderBackup(file, name);
  await persistFile(ui, ctx, (current) => deleteModels(current, name, selected), tr.deletedModels(selected.length, name));
}

export async function wizardHideProvider(
  ui: PimUi,
  ctx: RegistryCtx,
  file: ModelsFile,
  providerName?: string,
): Promise<void> {
  const tr = t();
  const hidden = new Set((await readSidecar()).hiddenProviders ?? []);
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.noProvidersInFile, "warning");
    return;
  }
  const visible = names.filter((name) => !hidden.has(name));
  if (visible.length === 0) {
    ui.notify(tr.hideProviderNone, "warning");
    return;
  }
  let name = providerName;
  if (!name) {
    name = await ui.select(
      tr.hideProviderTitle,
      visible.map((id) => ({ value: id, label: id })),
    );
  }
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ui.confirm(tr.confirmHideProvider, tr.confirmHideProviderMsg(name, count));
  if (ok !== true) return;
  await setProviderHidden(name, true);
  await refreshVisibility(ctx);
  ui.notify(tr.hiddenProvider(name), "info");
}

export async function wizardUnhideProvider(
  ui: PimUi,
  ctx: RegistryCtx,
  providerName?: string,
): Promise<void> {
  const tr = t();
  const hidden = (await readSidecar()).hiddenProviders ?? [];
  if (hidden.length === 0) {
    ui.notify(tr.unhideProviderNone, "warning");
    return;
  }
  // Only offer providers that still exist in models.json; a stale sidecar id
  // would look selectable but silently do nothing.
  const existing = new Set(listExistingProviders(await readModelsFile()));
  const usable = hidden.filter((id) => existing.has(id));
  const stale = hidden.filter((id) => !existing.has(id));
  if (stale.length > 0) {
    ui.notify(tr.unhideStale(stale.join(", ")), "warning");
    for (const id of stale) await setProviderHidden(id, false);
  }
  if (usable.length === 0) {
    ui.notify(tr.unhideProviderNone, "warning");
    return;
  }
  const name = providerName && usable.includes(providerName)
    ? providerName
    : await ui.select(
      tr.unhideProviderTitle,
      usable.map((id) => ({ value: id, label: id })),
    );
  if (!name || !isHidden(hidden, name)) return;
  await setProviderHidden(name, false);
  await refreshVisibility(ctx);
  ui.notify(tr.unhiddenProvider(name), "info");
}

async function resolveApiKey(ui: PimUi, ctx: RegistryCtx, name: string, stored: string | undefined): Promise<string | undefined> {
  const tr = t();
  const fromRegistry = await ctx.modelRegistry.getApiKeyForProvider?.(name);
  const key = fromRegistry || stored;
  if (key) return key;
  ui.notify(tr.refreshNeedKey(name), "warning");
  return ui.secret(tr.secretApiKey);
}

function endpointLabel(endpoint: EndpointRef, count: number): string {
  return `${endpoint.api}  ${endpoint.baseUrl}  (${count})`;
}

export async function wizardRefreshModels(
  ui: PimUi,
  ctx: RegistryCtx,
  file: ModelsFile,
  providerName?: string,
): Promise<ModelsFile | undefined> {
  const tr = t();
  const name = providerName ?? await pickProvider(ui, file);
  if (!name) return undefined;
  const provider = file.providers[name];
  const endpoints = providerEndpoints(provider);
  if (endpoints.length === 0) {
    ui.notify(tr.refreshNoEndpoint(name), "warning");
    return undefined;
  }
  const counts = new Map(endpoints.map((endpoint) => [
    endpointLabel(endpoint, (provider?.models ?? []).filter((model) =>
      (model.api ?? provider?.api) === endpoint.api && (model.baseUrl ?? provider?.baseUrl) === endpoint.baseUrl).length),
    endpoint,
  ]));
  const chosen = endpoints.length === 1
    ? endpoints[0]
    : counts.get(await ui.select(
        tr.refreshEndpointTitle(name),
        [...counts.keys()].map((label) => ({ value: label, label })),
      ) ?? "");
  if (!chosen) return undefined;

  const apiKey = await resolveApiKey(ui, ctx, name, provider?.apiKey);
  if (!apiKey) return undefined;
  const userAgent = provider?.headers?.["User-Agent"] === "node"
    || provider?.models?.some((model) => model.headers?.["User-Agent"] === "node") === true;
  const catalog = await ui.loader(
    tr.fetchingModels(chosen.api, chosen.baseUrl),
    (signal) => fetchCatalog({
      api: chosen.api as PiApi,
      baseUrl: chosen.baseUrl,
      apiKey,
      signal,
      userAgent,
    }),
    null,
  );
  if (catalog === null) return undefined;
  if (!catalog.ok) {
    ui.notify(catalog.error ?? tr.catalogFailed, "error");
    return undefined;
  }

  const plan = planRefresh(provider ?? {}, chosen, catalog.items.map((item) => item.id));
  // An id stored on another endpoint of this provider cannot be added here:
  // applyDrafts would skip it as a conflict, so do not offer it at all.
  const addable = plan.addable.filter((id) => !(provider?.models ?? []).some((model) => model.id === id));
  const selectedAdds = addable.length === 0
    ? []
    : await ui.multiSelect(tr.refreshModelsTitle, addable.map((id) => {
      const item = catalog.items.find((row) => row.id === id);
      const official = resolveDrafts(item ? [item] : [{ id }], chosen.api as PiApi, chosen.baseUrl).drafts[0];
      return {
        value: id,
        label: id,
        description: official ? `${official.contextWindow}/${official.maxTokens}` : "",
        hiddenByDefault: isNonChatModality(id, official?.match.official),
        checked: official?.match.kind === "official",
      };
    }));
  if (selectedAdds === undefined) return undefined;

  // Removals are opt-in: nothing is pre-checked, so Enter never deletes.
  const selectedRemoves = plan.removable.length === 0
    ? []
    : await ui.multiSelect(
      tr.refreshRemovedTitle(name),
      plan.removable.map((model) => ({ value: model.id, label: model.id })),
    );
  if (selectedRemoves === undefined) return undefined;
  if (selectedAdds.length === 0 && selectedRemoves.length === 0) {
    ui.notify(tr.refreshNothingChanged, "info");
    return file;
  }

  const drafts = refreshAdds(
    plan,
    selectedAdds,
    resolveDrafts(
      catalog.items.filter((item) => selectedAdds.includes(item.id)),
      chosen.api as PiApi,
      chosen.baseUrl,
      { userAgent },
    ).drafts,
  );
  await writeProviderBackup(file, name);
  return persistFile(ui, ctx, (current) => {
    const without = deleteModels(current, name, selectedRemoves);
    return applyDrafts(without, { providerId: name, drafts, mode: "merge" }).file;
  }, tr.refreshedModels(drafts.length, selectedRemoves.length, name));
}

/**
 * Model list for one provider. Selecting a model opens its capability editor,
 * which is what the old read-only "View" screen was missing.
 */
export async function wizardModels(
  ui: PimUi,
  ctx: RegistryCtx,
  file: ModelsFile,
  providerName: string,
): Promise<void> {
  const tr = t();
  while (true) {
    const current = await readModelsFile();
    const provider: ProviderRecord | undefined = current.providers[providerName];
    const models = provider?.models ?? [];
    if (!provider || models.length === 0) {
      ui.notify(tr.noModels(providerName), "warning");
      return;
    }
    const choice = await ui.select(
      tr.modelsTitle(providerName),
      models.map((m) => ({
        value: m.id,
        label: m.id,
        description: [
          `${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`,
          m.api ?? provider.api ?? "?",
          m.name && m.name !== m.id ? m.name : "",
        ].filter(Boolean).join("  "),
      })),
      tr.modelsSubtitle,
    );
    if (!choice) return;
    const model = models.find((m) => m.id === choice);
    if (!model) continue;
    const edited = await editDraft(ui, recordToDraft(model, provider));
    if (!edited) continue;
    await persistFile(
      ui,
      ctx,
      (file) => replaceModelRecords(file, providerName, [draftToRecord(edited)]),
      tr.editedModel(providerName, edited.id),
    );
  }
}

/** @deprecated kept for callers that still pass a file: use wizardModels with a provider name. */
export async function wizardEditModels(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ui, file);
  if (!name) return;
  await wizardModels(ui, ctx, file, name);
}

/** Per-provider action menu: everything that used to live in "Manage". */
export async function runProviderActions(
  ui: PimUi,
  ctx: RegistryCtx,
  providerName: string,
  pi?: { setModel: (model: unknown) => Promise<boolean> },
): Promise<void> {
  const tr = t();
  while (true) {
    const file = await readModelsFile();
    const provider = file.providers[providerName];
    if (!provider) return;
    const hidden = isHidden((await readSidecar()).hiddenProviders ?? [], providerName);
    const count = provider.models?.length ?? 0;
    const options: PimOption[] = [
      { value: "models", label: tr.providerModels, description: tr.providerModelsDesc },
      { value: "default", label: tr.providerSetDefault, description: tr.providerSetDefaultDesc },
      { value: "add", label: tr.providerAddApi, description: tr.providerAddApiDesc },
      { value: "refresh", label: tr.providerRefresh, description: tr.providerRefreshDesc },
      hidden
        ? { value: "unhide", label: tr.providerUnhide, description: tr.providerUnhideDesc }
        : { value: "hide", label: tr.providerHide, description: tr.providerHideDesc },
      { value: "backup", label: tr.providerBackup, description: tr.providerBackupDesc },
      { value: "deleteModels", label: tr.providerDeleteModels, description: tr.providerDeleteModelsDesc },
      {
        value: "deleteProvider",
        label: tr.providerDeleteProvider,
        description: tr.providerDeleteProviderDesc,
        danger: true,
      },
    ];
    const action = await ui.select(
      providerName,
      options,
      tr.providerStatus(count, provider.api ?? "?", hidden),
    );
    if (!action) return;
    if (action === "models") await wizardModels(ui, ctx, file, providerName);
    else if (action === "default") {
      const { wizardSwitchDefault } = await import("./wizard.ts");
      await wizardSwitchDefault(ctx as never, ui, pi ?? { setModel: async () => false }, providerName);
    } else if (action === "add") {
      const { wizardAddApi } = await import("./wizard.ts");
      await wizardAddApi(ctx as never, ui, file, pi ?? { setModel: async () => false }, providerName);
    } else if (action === "refresh") await wizardRefreshModels(ui, ctx, file, providerName);
    else if (action === "hide") await wizardHideProvider(ui, ctx, file, providerName);
    else if (action === "unhide") await wizardUnhideProvider(ui, ctx, providerName);
    else if (action === "backup") await wizardBackupProvider(ui, file, providerName);
    else if (action === "deleteModels") await wizardDeleteModels(ui, ctx, file, providerName);
    else if (action === "deleteProvider") {
      await wizardDeleteProvider(ui, ctx, file, providerName);
      return;
    }
  }
}

/** Provider list → per-provider actions. Replaces both "View" and "Manage". */
export async function runProvidersMenu(
  ui: PimUi,
  ctx: RegistryCtx,
  pi?: { setModel: (model: unknown) => Promise<boolean> },
): Promise<void> {
  const tr = t();
  while (true) {
    const file = await readModelsFile();
    const options = await providerOptions(file);
    if (options.length === 0) {
      ui.notify(tr.providersEmpty, "warning");
      return;
    }
    const name = await ui.select(tr.providersTitle, options, tr.providersSubtitle);
    if (!name) return;
    await runProviderActions(ui, ctx, name, pi);
  }
}

/** Kept for compatibility: the old flat manage menu is now the provider hub. */
export async function runManageMenu(ui: PimUi, ctx: RegistryCtx): Promise<void> {
  await runProvidersMenu(ui, ctx);
}
