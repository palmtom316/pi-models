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
import type { PimUi } from "./ui/pim-ui.ts";
import type { ModelsFile, PiApi } from "./types.ts";
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

async function pickProvider(ui: PimUi, file: ModelsFile, hidden?: ReadonlySet<string>): Promise<string | undefined> {
  const tr = t();
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.noProvidersInFile, "warning");
    return undefined;
  }
  return ui.select(tr.selectProvider, names.map((name) => hidden?.has(name) ? `${name}  (${tr.providerHiddenMark})` : name));
}

function providerFromLabel(label: string | undefined, names: readonly string[]): string | undefined {
  if (!label) return undefined;
  return names.find((name) => label === name || label.startsWith(`${name}  (`));
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

export async function wizardBackupProvider(ui: PimUi, file: ModelsFile): Promise<void> {
  const tr = t();
  const label = await pickProvider(ui, file);
  const name = providerFromLabel(label, listExistingProviders(file));
  if (!name) return;
  const path = await writeProviderBackup(file, name);
  ui.notify(tr.backedUpProvider(name, path), "info");
}

export async function wizardDeleteProvider(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const tr = t();
  const label = await pickProvider(ui, file);
  const name = providerFromLabel(label, listExistingProviders(file));
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ui.confirm(tr.confirmDeleteProvider, tr.confirmDeleteProviderMsg(name, count));
  if (ok !== true) return;
  const backup = await writeProviderBackup(file, name);
  await persistFile(ui, ctx, (current) => deleteProvider(current, name), tr.deletedProvider(name, backup));
}

export async function wizardDeleteModels(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const tr = t();
  const label = await pickProvider(ui, file);
  const name = providerFromLabel(label, listExistingProviders(file));
  if (!name) return;
  const models = file.providers[name]?.models ?? [];
  if (models.length === 0) {
    ui.notify(tr.noModels(name), "warning");
    return;
  }
  const selected = await ui.multiSelect(
    tr.deleteModelsTitle(name),
    models.map((m) => ({
      value: m.id,
      label: m.id,
      description: `${m.api ?? file.providers[name]?.api ?? "?"}  ${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`,
    })),
  );
  if (!selected || selected.length === 0) return;
  const ok = await ui.confirm(tr.confirmDeleteModels, tr.confirmDeleteModelsMsg(selected.length, name, selected));
  if (ok !== true) return;
  await writeProviderBackup(file, name);
  await persistFile(ui, ctx, (current) => deleteModels(current, name, selected), tr.deletedModels(selected.length, name));
}

export async function wizardHideProvider(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
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
  const name = await ui.select(tr.hideProviderTitle, visible);
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ui.confirm(tr.confirmHideProvider, tr.confirmHideProviderMsg(name, count));
  if (ok !== true) return;
  await setProviderHidden(name, true);
  const registry = await visibilityOf(ctx);
  if (registry) await applyVisibility(registry);
  ui.notify(tr.hiddenProvider(name), "info");
}

export async function wizardUnhideProvider(ui: PimUi, ctx: RegistryCtx): Promise<void> {
  const tr = t();
  const hidden = (await readSidecar()).hiddenProviders ?? [];
  if (hidden.length === 0) {
    ui.notify(tr.unhideProviderNone, "warning");
    return;
  }
  const name = await ui.select(tr.unhideProviderTitle, hidden);
  if (!name || !isHidden(hidden, name)) return;
  await setProviderHidden(name, false);
  const registry = await visibilityOf(ctx);
  if (registry) await applyVisibility(registry);
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

export async function wizardRefreshModels(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<ModelsFile | undefined> {
  const tr = t();
  const names = listExistingProviders(file);
  const label = await pickProvider(ui, file, new Set((await readSidecar()).hiddenProviders ?? []));
  const name = providerFromLabel(label, names);
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
    : counts.get(await ui.select(tr.refreshEndpointTitle(name), [...counts.keys()]) ?? "");
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

  const selectedRemoves = plan.removable.length === 0
    ? []
    : await ui.multiSelect(
      tr.refreshRemovedTitle(name),
      plan.removable.map((model) => ({ value: model.id, label: model.id, checked: true })),
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

export async function wizardEditModels(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const tr = t();
  const label = await pickProvider(ui, file);
  const name = providerFromLabel(label, listExistingProviders(file));
  if (!name) return;
  const provider = file.providers[name];
  const models = provider?.models ?? [];
  if (!provider || models.length === 0) {
    ui.notify(tr.noModels(name), "warning");
    return;
  }
  const selected = await ui.multiSelect(
    tr.editModelsTitle(name),
    models.map((m) => ({
      value: m.id,
      label: m.id,
      description: `${m.name ?? ""}  ${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`,
    })),
  );
  if (!selected || selected.length === 0) return;

  const records = [];
  for (const id of selected) {
    const model = models.find((m) => m.id === id);
    if (!model) continue;
    const edited = await editDraft(ui, recordToDraft(model, provider));
    if (!edited) return;
    records.push(draftToRecord(edited));
  }
  await persistFile(ui, ctx, (current) => replaceModelRecords(current, name, records), tr.editModelsTitle(name));
}

export async function runManageMenu(ui: PimUi, ctx: RegistryCtx): Promise<void> {
  while (true) {
    const tr = t();
    const file = await readModelsFile();
    const action = await ui.select(tr.manageTitle, [
      tr.manageBackup,
      tr.manageHideProvider,
      tr.manageUnhideProvider,
      tr.manageRefreshModels,
      tr.manageDeleteProvider,
      tr.manageDeleteModels,
      tr.manageEditCaps,
      tr.manageBack,
    ]);
    if (!action || action === tr.manageBack) return;
    if (action === tr.manageBackup) await wizardBackupProvider(ui, file);
    else if (action === tr.manageHideProvider) await wizardHideProvider(ui, ctx, file);
    else if (action === tr.manageUnhideProvider) await wizardUnhideProvider(ui, ctx);
    else if (action === tr.manageRefreshModels) await wizardRefreshModels(ui, ctx, file);
    else if (action === tr.manageDeleteProvider) await wizardDeleteProvider(ui, ctx, file);
    else if (action === tr.manageDeleteModels) await wizardDeleteModels(ui, ctx, file);
    else if (action === tr.manageEditCaps) await wizardEditModels(ui, ctx, file);
  }
}
