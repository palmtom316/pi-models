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
import { multiSelect } from "./ui/multi-select.ts";
import type { ModelsFile } from "./types.ts";

type CmdCtx = {
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
  };
};

async function persistFile(ctx: CmdCtx, file: ModelsFile, message: string): Promise<void> {
  const { backupPath } = await writeModelsFile(file);
  await ctx.modelRegistry.refresh();
  const err = ctx.modelRegistry.getError();
  if (err) {
    ctx.ui.notify(`refresh failed: ${err}${backupPath ? `\nmodels.json backup: ${backupPath}` : ""}`, "error");
    return;
  }
  ctx.ui.notify(message, "info");
}

async function pickProvider(ctx: CmdCtx, file: ModelsFile): Promise<string | undefined> {
  const names = listExistingProviders(file);
  if (names.length === 0) {
    ctx.ui.notify("No providers in models.json", "warning");
    return undefined;
  }
  return ctx.ui.select("Provider", names);
}

export async function wizardBackupProvider(ctx: CmdCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ctx, file);
  if (!name) return;
  const path = await writeProviderBackup(file, name);
  ctx.ui.notify(`Backed up ${name} → ${path}`, "info");
}

export async function wizardDeleteProvider(ctx: CmdCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ctx, file);
  if (!name) return;
  const count = file.providers[name]?.models?.length ?? 0;
  const ok = await ctx.ui.confirm("Delete provider?", `Remove ${name} and its ${count} model(s) from models.json?`);
  if (!ok) return;
  const backup = await writeProviderBackup(file, name);
  await persistFile(ctx, deleteProvider(file, name), `Deleted ${name} (copy at ${backup})`);
}

export async function wizardDeleteModels(ctx: CmdCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ctx, file);
  if (!name) return;
  const models = file.providers[name]?.models ?? [];
  if (models.length === 0) {
    ctx.ui.notify(`${name} has no models`, "warning");
    return;
  }
  const selected = await multiSelect(
    ctx,
    `Delete models from ${name}`,
    models.map((m) => ({
      value: m.id,
      label: m.id,
      description: `${m.api ?? file.providers[name]?.api ?? "?"}  ${m.contextWindow ?? "?"}/${m.maxTokens ?? "?"}`,
    })),
  );
  if (!selected || selected.length === 0) return;
  const ok = await ctx.ui.confirm("Delete models?", `${selected.length} model(s) from ${name}:\n${selected.slice(0, 12).join("\n")}`);
  if (!ok) return;
  await writeProviderBackup(file, name);
  await persistFile(ctx, deleteModels(file, name, selected), `Deleted ${selected.length} model(s) from ${name}`);
}

export async function wizardEditModels(ctx: CmdCtx, file: ModelsFile): Promise<void> {
  const name = await pickProvider(ctx, file);
  if (!name) return;
  const provider = file.providers[name];
  const models = provider?.models ?? [];
  if (!provider || models.length === 0) {
    ctx.ui.notify(`${name} has no models`, "warning");
    return;
  }
  const selected = await multiSelect(
    ctx,
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
    const edited = await editDraft(ctx, recordToDraft(model, provider));
    if (!edited) return;
    records.push(draftToRecord(edited));
  }
  await persistFile(ctx, replaceModelRecords(file, name, records), `Updated ${records.length} model(s) on ${name}`);
}

export async function runManageMenu(ctx: CmdCtx): Promise<void> {
  const file = await readModelsFile();
  const action = await ctx.ui.select("Manage models.json", [
    "Backup a provider",
    "Delete a provider",
    "Delete models from a provider",
    "Edit model capabilities",
    "Back",
  ]);
  if (!action || action === "Back") return;
  if (action.startsWith("Backup")) return wizardBackupProvider(ctx, file);
  if (action.startsWith("Delete a provider")) return wizardDeleteProvider(ctx, file);
  if (action.startsWith("Delete models")) return wizardDeleteModels(ctx, file);
  if (action.startsWith("Edit")) return wizardEditModels(ctx, file);
}
