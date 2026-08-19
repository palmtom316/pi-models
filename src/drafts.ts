import { heuristicCaps, modelCompatFromMatch, NODE_UA, officialInput, thinkingLevelMapFromOfficial } from "./defaults.ts";
import { matchOfficial, type MatchOfficialOptions } from "./match.ts";
import type { CatalogItem } from "./catalog.ts";
import type { ModelDraft, OfficialCatalog, PiApi } from "./types.ts";

export function buildDraft(
  item: CatalogItem,
  api: PiApi,
  baseUrl: string,
  catalog: OfficialCatalog,
  opts: { userAgent?: boolean } & MatchOfficialOptions = {},
): ModelDraft {
  const hit = matchOfficial(item.id, catalog, { fuzzy: opts.fuzzy, source: opts.source });
  const official = hit.official;
  const heur = heuristicCaps(item.id);

  const reasoning = official?.reasoning ?? heur.reasoning;
  const input = officialInput(official, heur.input);
  const contextWindow = official?.limit?.context ?? heur.contextWindow;
  const maxTokens = official?.limit?.output ?? heur.maxTokens;
  const thinkingLevelMap = official ? thinkingLevelMapFromOfficial(official) : heur.thinkingLevelMap;
  const compat = modelCompatFromMatch(api, hit);
  const headers = opts.userAgent === false ? undefined : { ...NODE_UA };

  return {
    id: item.id,
    name: official?.name ?? item.name ?? item.id,
    api,
    baseUrl,
    reasoning,
    input: [...input],
    contextWindow,
    maxTokens,
    thinkingLevelMap,
    headers,
    compat,
    match: hit,
  };
}

export function buildDrafts(
  items: CatalogItem[],
  api: PiApi,
  baseUrl: string,
  catalog: OfficialCatalog,
  opts?: { userAgent?: boolean } & MatchOfficialOptions,
): ModelDraft[] {
  return items.map((item) => buildDraft(item, api, baseUrl, catalog, opts));
}
