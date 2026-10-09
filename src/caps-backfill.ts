import type { Model, Provider } from "@earendil-works/pi-ai";
import { officialInput } from "./defaults.ts";
import { mutateModelsFile, readModelsFile } from "./models-json.ts";
import { matchBuiltin } from "./resolve.ts";
import type { ModelsFile, ModelRecord, ProviderRecord } from "./types.ts";

export type InputList = Array<"text" | "image">;

/**
 * Catalog-backed `image` upgrade for a single model id.
 *
 * Returns the input list to write, or undefined when nothing should change.
 * Only exact / alias hits on the builtin catalog are trusted (no fuzzy, no
 * heuristic, no models.dev), and the upgrade is one-way: `["text"]` becomes
 * `["text","image"]`, never the reverse. A model the catalog marks text-only
 * and an id the catalog does not know are both left alone.
 */
export function backfilledInput(id: string, current?: readonly string[]): InputList | undefined {
  const hit = matchBuiltin(id);
  if (hit.kind !== "official" || !hit.official) return undefined;
  const want = officialInput(hit.official);
  if (!want.includes("image")) return undefined;
  if (current?.includes("image")) return undefined;
  return [...want];
}

export interface InputBackfillChange {
  provider: string;
  id: string;
  from?: InputList;
  to: InputList;
}

/** True when the provider pins this model's input via `modelOverrides`. */
function inputPinned(provider: ProviderRecord, id: string): boolean {
  const override = provider.modelOverrides?.[id];
  return override !== null && typeof override === "object" && "input" in (override as Record<string, unknown>);
}

function upgradeModel(provider: ProviderRecord, model: ModelRecord): ModelRecord | undefined {
  if (inputPinned(provider, model.id)) return undefined;
  const to = backfilledInput(model.id, model.input);
  return to ? { ...model, input: to } : undefined;
}

/**
 * Pure planner: returns a copy of the file with every stale `input` upgraded,
 * plus the list of changes. Providers without a change are returned as-is.
 */
export function planInputBackfill(file: ModelsFile): { file: ModelsFile; changes: InputBackfillChange[] } {
  const changes: InputBackfillChange[] = [];
  const providers: Record<string, ProviderRecord> = Object.create(null) as Record<string, ProviderRecord>;
  for (const [providerId, provider] of Object.entries(file.providers ?? {})) {
    let models = provider.models;
    if (models?.length) {
      let touched = false;
      models = models.map((model) => {
        const next = upgradeModel(provider, model);
        if (!next) return model;
        touched = true;
        changes.push({ provider: providerId, id: model.id, from: model.input, to: next.input! });
        return next;
      });
      if (!touched) models = provider.models;
    }
    providers[providerId] = models === provider.models ? provider : { ...provider, models };
  }
  return { file: { providers }, changes };
}

/**
 * Persist the upgrade to models.json (atomic write + rotating backup) and
 * report what changed. A models.json that is already correct is not rewritten,
 * so no pointless backup is produced.
 */
export async function persistInputBackfill(): Promise<InputBackfillChange[]> {
  const preview = planInputBackfill(await readModelsFile());
  if (preview.changes.length === 0) return [];
  let changes: InputBackfillChange[] = [];
  await mutateModelsFile((current) => {
    const plan = planInputBackfill(current);
    changes = plan.changes;
    return plan.file;
  });
  return changes;
}

/** `provider/id` labels for the notice, capped so a long list stays readable. */
export function describeChanges(changes: readonly InputBackfillChange[], max = 3): string {
  const labels = changes.map((change) => `${change.provider}/${change.id}`);
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} +${labels.length - max}`;
}

/** Registry view: patch `getModels()` so this session sees the corrected input. */
export interface InputBackfillRegistry {
  getProviders?: () => readonly Provider[];
  getProvider: (id: string) => Provider | undefined;
  registerProvider: (provider: Provider) => void;
  unregisterProvider?: (id: string) => void;
}

/** Providers this extension has wrapped with a catalog-corrected model list. */
const wrappedInputs = new Set<string>();

function patchModels(models: readonly Model[]): readonly Model[] {
  let changed = false;
  const next = models.map((model) => {
    const to = backfilledInput(model.id, model.input);
    if (!to) return model;
    changed = true;
    return { ...model, input: to };
  });
  return changed ? next : models;
}

export function needsInputBackfill(models: readonly Model[]): boolean {
  return patchModels(models) !== models;
}

/**
 * Re-register the provider with a `getModels()` that upgrades stale input
 * lists, keeping id/name/auth/stream from the composed provider. Pi resolves
 * its request-time image gate against these models, so the fix lands in the
 * running session instead of waiting for the next launch.
 */
export function wrapForInputBackfill(base: Provider): Provider {
  const previous = base.getModels.bind(base);
  return { ...base, getModels: () => patchModels(previous()) };
}

/**
 * Apply the runtime upgrade to every registry provider that needs it. Safe to
 * call again after models.json changes: wrapped ids are re-read from the
 * current composed provider, and ids that no longer need it are unwrapped.
 */
export async function applyInputBackfill(registry: InputBackfillRegistry): Promise<number> {
  const ids = registry.getProviders
    ? registry.getProviders().map((provider) => provider.id)
    : Object.keys((await readModelsFile()).providers);

  let patched = 0;
  for (const id of ids) {
    const base = registry.getProvider(id);
    if (!base) continue;
    if (!needsInputBackfill(base.getModels())) {
      if (wrappedInputs.delete(id)) registry.unregisterProvider?.(id);
      continue;
    }
    registry.registerProvider(wrapForInputBackfill(base));
    wrappedInputs.add(id);
    patched++;
  }
  return patched;
}
