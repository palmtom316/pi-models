import {
  deleteModels,
  deleteProvider,
  draftToRecord,
  listExistingProviders,
  readModelsFile,
  replaceModelRecords,
  rollbackModelsFile,
  writeModelsFile,
  writeProviderBackup,
} from "./models-json.ts";
import { recordToDraft } from "./caps.ts";
import { editDraft } from "./ui/edit-caps.ts";
import type { PimUi } from "./ui/pim-ui.ts";
import type { ModelsFile } from "./types.ts";
import { t } from "./i18n.ts";

export type RegistryCtx = {
  modelRegistry: {
    refresh: () => Promise<unknown>;
    getError: () => string | undefined;
  };
};

/**
 * Write + refresh + rollback-on-error, shared by every manage/view flow.
 * Returns the persisted file (disk state) so callers can continue from it,
 * or undefined when pi rejected the config (rolled back).
 */
export async function persistFile(
  ui: PimUi,
  ctx: RegistryCtx,
  file: ModelsFile,
  message: string,
): Promise<ModelsFile | undefined> {
  const tr = t();
  const { backupPath } = await writeModelsFile(file);
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

async function pickProvider(ui: PimUi, file: ModelsFile): Promise<string | undefined> {
  const tr = t();
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify(tr.noProvidersInFile, "warning");
    return undefined;
  }
  return ui.select(tr.selectProvider, names);
}

export async function wizardBackupProvider(ui: PimUi, file: ModelsFile): Promise<void> {
  const tr = t();
  const name = await pickProvider(ui, file);
  if (!name) return;
  const path = await writeProviderBackup(file, name);
  ui.notify(tr.backedUpProvider(name, path), "info");
}

export async function wizardDeleteProvider(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const tr = t();
  const name = await pickProvider(ui, file);
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ui.confirm(tr.confirmDeleteProvider, tr.confirmDeleteProviderMsg(name, count));
  if (ok !== true) return;
  const backup = await writeProviderBackup(file, name);
  await persistFile(ui, ctx, deleteProvider(file, name), tr.deletedProvider(name, backup));
}

export async function wizardDeleteModels(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const tr = t();
  const name = await pickProvider(ui, file);
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
  await persistFile(ui, ctx, deleteModels(file, name, selected), tr.deletedModels(selected.length, name));
}

export async function wizardEditModels(ui: PimUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const tr = t();
  const name = await pickProvider(ui, file);
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
  await persistFile(ui, ctx, replaceModelRecords(file, name, records), tr.editModelsTitle(name));
}

export async function runManageMenu(ui: PimUi, ctx: RegistryCtx): Promise<void> {
  while (true) {
    const tr = t();
    const file = await readModelsFile();
    const action = await ui.select(tr.manageTitle, [
      tr.manageBackup,
      tr.manageDeleteProvider,
      tr.manageDeleteModels,
      tr.manageEditCaps,
      tr.manageBack,
    ]);
    if (!action || action === tr.manageBack) return;
    if (action === tr.manageBackup) await wizardBackupProvider(ui, file);
    else if (action === tr.manageDeleteProvider) await wizardDeleteProvider(ui, ctx, file);
    else if (action === tr.manageDeleteModels) await wizardDeleteModels(ui, ctx, file);
    else if (action === tr.manageEditCaps) await wizardEditModels(ui, ctx, file);
  }
}
