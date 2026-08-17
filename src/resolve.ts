import { BUILTIN_CATALOG } from "./builtin-catalog.ts";
import { buildDraft } from "./drafts.ts";
import { matchOfficial } from "./match.ts";
import { loadOfficialCatalog, type LoadOfficialOptions, type LoadOfficialResult } from "./models-dev.ts";
import type { CatalogItem } from "./catalog.ts";
import type { ModelDraft, OfficialCatalog, PiApi } from "./types.ts";

export function matchBuiltin(remoteId: string) {
  return matchOfficial(remoteId, BUILTIN_CATALOG, { fuzzy: false, source: "builtin" });
}

export function mergeCatalogs(primary: OfficialCatalog, extra: OfficialCatalog): OfficialCatalog {
  const out: OfficialCatalog = { ...primary };
  for (const [bucket, provider] of Object.entries(extra)) {
    const existing = out[bucket];
    if (!existing) {
      out[bucket] = provider;
      continue;
    }
    out[bucket] = {
      ...existing,
      models: { ...provider.models, ...existing.models },
    };
  }
  return out;
}

export interface ResolveDraftsOptions {
  userAgent?: boolean;
  remote?: OfficialCatalog;
}

export function resolveDrafts(
  items: CatalogItem[],
  api: PiApi,
  baseUrl: string,
  opts: ResolveDraftsOptions = {},
): { drafts: ModelDraft[]; unknownIds: string[] } {
  const drafts: ModelDraft[] = [];
  const unknownIds: string[] = [];
  for (const item of items) {
    const builtinHit = matchBuiltin(item.id);
    if (builtinHit.kind === "official") {
      drafts.push(buildDraft(item, api, baseUrl, BUILTIN_CATALOG, { ...opts, fuzzy: false, source: "builtin" }));
      continue;
    }
    if (opts.remote) {
      drafts.push(buildDraft(item, api, baseUrl, opts.remote, { ...opts, source: "models.dev" }));
      continue;
    }
    drafts.push(buildDraft(item, api, baseUrl, BUILTIN_CATALOG, { ...opts, fuzzy: false, source: "builtin" }));
    unknownIds.push(item.id);
  }
  return { drafts, unknownIds };
}

export async function enrichUnknownDrafts(
  items: CatalogItem[],
  api: PiApi,
  baseUrl: string,
  unknownIds: string[],
  opts: { userAgent?: boolean } & LoadOfficialOptions = {},
): Promise<{ drafts: ModelDraft[]; remote?: LoadOfficialResult }> {
  if (unknownIds.length === 0) {
    return { drafts: resolveDrafts(items, api, baseUrl, { userAgent: opts.userAgent }).drafts };
  }
  const remote = await loadOfficialCatalog(opts);
  const catalog = mergeCatalogs(BUILTIN_CATALOG, remote.catalog);
  return {
    drafts: resolveDrafts(items, api, baseUrl, { userAgent: opts.userAgent, remote: catalog }).drafts,
    remote,
  };
}
