import {
  deleteModels,
  deleteProvider,
  draftToRecord,
  listExistingProviders,
  readModelsFile,
  replaceModelRecords,
  writeModelsFile,
  writeProviderBackup,
} from "./models-json.ts";
import { recordToDraft } from "./caps.ts";
import { editDraft } from "./ui/edit-caps.ts";
import type { HubUi } from "./ui/hub-ui.ts";
import type { ModelsFile } from "./types.ts";

type RegistryCtx = {
  modelRegistry: {
    refresh: () => Promise<unknown>;
    getError: () => string | undefined;
  };
};

async function persistFile(ui: HubUi, ctx: RegistryCtx, file: ModelsFile, message: string): Promise<void> {
  const { backupPath } = await writeModelsFile(file);
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ui.notify(`refresh failed: ${err}${backupPath ? `\nmodels.json backup: ${backupPath}` : ""}`, "error");
    return;
  }
  ui.notify(message, "info");
}

async function pickProvider(ui: HubUi, file: ModelsFile): Promise<string | undefined> {
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ui.notify("No providers in models.json", "warning");
    return undefined;
  }
  return ui.select("Provider", names);
}

export async function wizardBackupProvider(ui: HubUi, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ui, file);
  if (!name) return;
  const path = await writeProviderBackup(file, name);
  ui.notify(`Backed up ${name} → ${path}`, "info");
}

export async function wizardDeleteProvider(ui: HubUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ui, file);
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ui.confirm("Delete provider?", `Remove ${name} and its ${count} model(s) from models.json?`);
  if (!ok) return;
  const backup = await writeProviderBackup(file, name);
  await persistFile(ui, ctx, deleteProvider(file, name), `Deleted ${name} (copy at ${backup})`);
}

export async function wizardDeleteModels(ui: HubUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ui, file);
  if (!name) return;
  const models = file.providers[name]?.models ?? [];
  if (models.length === 0) {
    ui.notify(`${name} has no models`, "warning");
    return;
  }
  const selected = await ui.multiSelect(
    `Delete models from ${name}`,
    models.map((m) => ({
      value: m.id,
      label: m.id,
      description: `${m.api ?? file.providers[name]?.api ?? "?"}  ${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`,
    })),
  );
  if (!selected || selected.length === 0) return;
  const ok = await ui.confirm("Delete models?", `${selected.length} model(s) from ${name}:\n${selected.slice(0, 12).join("\n")}`);
  if (!ok) return;
  await writeProviderBackup(file, name);
  await persistFile(ui, ctx, deleteModels(file, name, selected), `Deleted ${selected.length} model(s) from ${name}`);
}

export async function wizardEditModels(ui: HubUi, ctx: RegistryCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ui, file);
  if (!name) return;
  const provider = file.providers[name];
  const models = provider?.models ?? [];
  if (!provider || models.length === 0) {
    ui.notify(`${name} has no models`, "warning");
    return;
  }
  const selected = await ui.multiSelect(
    `Edit models on ${name}`,
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
  await persistFile(ui, ctx, replaceModelRecords(file, name, records), `Updated ${records.length} model(s) on ${name}`);
}

export async function runManageMenu(ui: HubUi, ctx: RegistryCtx): Promise<void> {
  const file = await readModelsFile();
  const action = await ui.select("Manage models.json", [
    "Backup a provider",
    "Delete a provider",
    "Delete models from a provider",
    "Edit model capabilities",
    "Back",
  ]);
  if (!action || action === "Back") return;
  if (action.startsWith("Backup")) return wizardBackupProvider(ui, file);
  if (action.startsWith("Delete a provider")) return wizardDeleteProvider(ui, ctx, file);
  if (action.startsWith("Delete models")) return wizardDeleteModels(ui, ctx, file);
  if (action.startsWith("Edit")) return wizardEditModels(ui, ctx, file);
}
