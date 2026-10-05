import type { ModelDraft, ModelRecord, ProviderRecord } from "./types.ts";

export interface EndpointRef {
  api: string;
  baseUrl: string;
}

export interface RefreshPlan {
  endpoint: EndpointRef;
  /** Catalog ids that are not already stored for this provider. */
  addable: string[];
  /** Stored models of this endpoint whose id is missing from the catalog. */
  removable: ModelRecord[];
  /** Stored models of this endpoint that the catalog still lists. */
  kept: ModelRecord[];
}

function endpointOf(model: ModelRecord, provider: ProviderRecord): EndpointRef | undefined {
  const api = model.api ?? provider.api;
  const baseUrl = model.baseUrl ?? provider.baseUrl;
  if (!api || !baseUrl) return undefined;
  return { api, baseUrl };
}

export function providerEndpoints(provider: ProviderRecord | undefined): EndpointRef[] {
  const seen = new Map<string, EndpointRef>();
  for (const model of provider?.models ?? []) {
    const endpoint = endpointOf(model, provider ?? {});
    if (!endpoint) continue;
    seen.set(`${endpoint.api}\n${endpoint.baseUrl}`, endpoint);
  }
  if (seen.size === 0 && provider?.api && provider.baseUrl) {
    seen.set(`${provider.api}\n${provider.baseUrl}`, { api: provider.api, baseUrl: provider.baseUrl });
  }
  return [...seen.values()];
}

/**
 * Diff one stored endpoint against a freshly fetched catalog.
 * Comparison is by model id only; the caller never changes the provider id,
 * api, or baseUrl.
 */
export function planRefresh(
  provider: ProviderRecord,
  endpoint: EndpointRef,
  catalogIds: readonly string[],
): RefreshPlan {
  const catalog = new Set(catalogIds);
  const stored = (provider.models ?? []).filter((model) => {
    const loc = endpointOf(model, provider);
    return loc?.api === endpoint.api && loc.baseUrl === endpoint.baseUrl;
  });
  const storedIds = new Set(stored.map((model) => model.id));
  return {
    endpoint,
    addable: catalogIds.filter((id) => !storedIds.has(id)),
    removable: stored.filter((model) => !catalog.has(model.id)),
    kept: stored.filter((model) => catalog.has(model.id)),
  };
}

export function refreshAdds(plan: RefreshPlan, selectedIds: readonly string[], drafts: readonly ModelDraft[]): ModelDraft[] {
  const wanted = new Set(selectedIds);
  return drafts.filter((draft) => wanted.has(draft.id) && plan.addable.includes(draft.id));
}
