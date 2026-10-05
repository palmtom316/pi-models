import type { Model, Provider } from "@earendil-works/pi-ai";
import { readSidecar, writeSidecar } from "./sidecar.ts";

export type VisibilityRegistry = {
  getProvider: (id: string) => Provider | undefined;
  registerProvider: (provider: Provider) => void;
  unregisterProvider: (id: string) => void;
};

/** Providers this extension has wrapped so /model can hide their models. */
const wrapped = new Set<string>();

export function isHidden(hidden: readonly string[] | undefined, providerId: string): boolean {
  return hidden?.includes(providerId) === true;
}

/**
 * Drop every chat model when the provider is hidden. Built-in filters still
 * run first, so a hidden flag stacks on top of credential gating.
 */
export function hideChatModels<TApi extends string>(
  hidden: boolean,
  models: readonly Model<TApi>[],
  credential: unknown,
  base?: (models: readonly Model<TApi>[], credential: unknown) => readonly Model<TApi>[],
): readonly Model<TApi>[] {
  const filtered = base?.(models, credential) ?? models;
  return hidden ? [] : filtered;
}

/**
 * Register a native provider whose only job is filterModels. Pi composes it
 * under models.json, so the file stays the catalog and /model sees the filter.
 * Passing the already-composed provider keeps its stream, auth, and any
 * built-in filter.
 */
export function wrapForVisibility(base: Provider, hidden: boolean): Provider {
  const previous = base.filterModels?.bind(base);
  return {
    ...base,
    filterModels: (models, credential) => hideChatModels(hidden, models, credential, previous),
  };
}

export async function setProviderHidden(providerId: string, hidden: boolean): Promise<void> {
  const current = await readSidecar();
  const ids = new Set(current.hiddenProviders ?? []);
  if (hidden) ids.add(providerId);
  else ids.delete(providerId);
  await writeSidecar({ ...current, hiddenProviders: [...ids].sort() });
}

/**
 * Apply the sidecar hide list to every provider currently in the registry.
 * Safe to call again after models.json changes: each call re-wraps the latest
 * composed provider.
 */
export async function applyVisibility(registry: VisibilityRegistry): Promise<void> {
  const hidden = new Set((await readSidecar()).hiddenProviders ?? []);
  const ids = new Set([...wrapped, ...hidden]);
  for (const id of ids) {
    if (!hidden.has(id)) {
      if (wrapped.delete(id)) registry.unregisterProvider(id);
      continue;
    }
    const base = registry.getProvider(id);
    if (!base) continue;
    registry.registerProvider(wrapForVisibility(base, true));
    wrapped.add(id);
  }
}
