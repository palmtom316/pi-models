import { heuristicCaps, officialInput, thinkingLevelMapFromOfficial } from "./defaults.ts";
import { matchBuiltin } from "./resolve.ts";
import type { ModelDraft, ModelRecord, ProviderRecord } from "./types.ts";

export function resetDraftCaps(draft: ModelDraft): ModelDraft {
  const hit = matchBuiltin(draft.id);
  if (hit.kind === "official" && hit.official) {
    const official = hit.official;
    return {
      ...draft,
      name: official.name ?? draft.name,
      reasoning: official.reasoning ?? true,
      input: officialInput(official),
      contextWindow: official.limit?.context ?? draft.contextWindow,
      maxTokens: official.limit?.output ?? draft.maxTokens,
      thinkingLevelMap: thinkingLevelMapFromOfficial(official),
      match: { ...hit, source: "builtin" },
    };
  }
  const heur = heuristicCaps(draft.id);
  return {
    ...draft,
    reasoning: heur.reasoning,
    input: [...heur.input],
    contextWindow: heur.contextWindow,
    maxTokens: heur.maxTokens,
    thinkingLevelMap: heur.thinkingLevelMap,
  };
}

export function recordToDraft(model: ModelRecord, provider: ProviderRecord): ModelDraft {
  const api = (model.api ?? provider.api ?? "openai-completions") as ModelDraft["api"];
  const baseUrl = model.baseUrl ?? provider.baseUrl ?? "";
  return {
    id: model.id,
    name: model.name ?? model.id,
    api,
    baseUrl,
    reasoning: model.reasoning ?? false,
    thinkingLevelMap: model.thinkingLevelMap,
    input: model.input ?? ["text"],
    contextWindow: model.contextWindow ?? 128_000,
    maxTokens: model.maxTokens ?? 16_384,
    headers: model.headers,
    samplingParams: model.samplingParams,
    compat: model.compat,
    match: matchBuiltin(model.id),
  };
}
