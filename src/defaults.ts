import type { MatchHit, ModelCompat, OfficialModel, PiApi, ThinkingLevelMap } from "./types.ts";
import { THINKING_LEVELS } from "./types.ts";
import { isOpenAiApi } from "./types.ts";

export const PROVIDER_COMPAT: ModelCompat = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  supportsLongCacheRetention: false,
};

export const NODE_UA = { "User-Agent": "node" } as const;

const EMPTY_MAP = (): ThinkingLevelMap => ({
  off: null,
  minimal: null,
  low: null,
  medium: null,
  high: null,
  xhigh: null,
  max: null,
});

function hasEffort(options: OfficialModel["reasoning_options"], name: string): boolean {
  return (options ?? []).some((o) => o.type === "effort" && (o.values ?? []).includes(name));
}

function hasToggle(options: OfficialModel["reasoning_options"]): boolean {
  return (options ?? []).some((o) => o.type === "toggle");
}

export function interleavedField(model?: OfficialModel): string | undefined {
  const v = model?.interleaved;
  if (v && typeof v === "object" && typeof v.field === "string") return v.field;
  return undefined;
}

export function thinkingLevelMapFromOfficial(model: OfficialModel): ThinkingLevelMap {
  const map = EMPTY_MAP();
  const options = model.reasoning_options ?? [];
  const efforts = options.find((o) => o.type === "effort");
  const values = efforts?.values ?? [];
  const toggle = hasToggle(options);

  if (values.length === 0 && toggle) {
    map.off = "disabled";
    map.high = "enabled";
    return map;
  }

  if (values.length === 0 && model.reasoning) {
    map.high = "high";
    return map;
  }

  for (const raw of values) {
    if (raw === "none") {
      map.off = "none";
      continue;
    }
    if ((THINKING_LEVELS as readonly string[]).includes(raw)) {
      map[raw as keyof ThinkingLevelMap] = raw;
    }
  }

  if (toggle && map.off == null) {
    map.off = "disabled";
  }

  return map;
}

export function modelCompatFromMatch(api: PiApi, hit: MatchHit): ModelCompat | undefined {
  const official = hit.official;
  const field = interleavedField(official);
  const bucket = hit.bucket;
  const id = (official?.id ?? "").toLowerCase();
  const family = (official?.family ?? "").toLowerCase();

  if (!isOpenAiApi(api)) {
    if (api === "anthropic-messages" && (bucket === "anthropic" || /claude/.test(id))) {
      const version = id.match(/^claude-[a-z0-9]+-(\d+)(?:-(\d+))?(?:-|$)/);
      const major = Number(version?.[1] ?? 0);
      const minor = Number(version?.[2] ?? 0);
      const looksAdaptive = major >= 5 || (major === 4 && minor >= 6);
      if (looksAdaptive) {
        return { forceAdaptiveThinking: true };
      }
    }
    return undefined;
  }

  if (bucket === "zhipuai" || bucket === "zai" || family.startsWith("glm") || id.includes("glm-")) {
    if (field === "reasoning_content" || bucket === "zhipuai" || bucket === "zai") {
      return {
        thinkingFormat: "zai",
        requiresReasoningContentOnAssistantMessages: true,
      };
    }
  }

  if (bucket === "moonshotai") {
    return {
      thinkingFormat: "openai",
      requiresReasoningContentOnAssistantMessages: true,
    };
  }

  if (field === "reasoning_content" || bucket === "deepseek") {
    return {
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
    };
  }

  return undefined;
}

export interface HeuristicCaps {
  name?: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: ThinkingLevelMap;
  note: string;
}

export function heuristicCaps(id: string): HeuristicCaps {
  const s = id.toLowerCase();
  const map = EMPTY_MAP();

  if (s.includes("deepseek") || s.includes("v4-flash")) {
    map.off = "disabled";
    map.low = "low";
    map.high = "high";
    map.max = "max";
    return {
      reasoning: true,
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      thinkingLevelMap: map,
      note: "heuristic: deepseek-v4",
    };
  }
  if (s.includes("glm-5.3")) {
    map.low = "low";
    map.high = "high";
    map.max = "max";
    return {
      reasoning: true,
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      thinkingLevelMap: map,
      note: "heuristic: glm-5.3",
    };
  }
  if (s.includes("glm-5.2") || s.includes("glm-5")) {
    map.off = "none";
    map.high = "high";
    map.max = "max";
    return {
      reasoning: true,
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      thinkingLevelMap: map,
      note: "heuristic: glm-5",
    };
  }
  if (s.includes("grok-4.6")) {
    map.low = "low";
    map.medium = "medium";
    map.high = "high";
    map.xhigh = "xhigh";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 500_000,
      maxTokens: 500_000,
      thinkingLevelMap: map,
      note: "heuristic: grok-4.6",
    };
  }
  if (s.includes("grok-4")) {
    map.low = "low";
    map.medium = "medium";
    map.high = "high";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 500_000,
      maxTokens: 500_000,
      thinkingLevelMap: map,
      note: "heuristic: grok-4",
    };
  }
  if (s.includes("kimi") && (s.includes("k3") || /kimi-k3/.test(s))) {
    map.low = "low";
    map.high = "high";
    map.max = "max";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_048_576,
      maxTokens: 131_072,
      thinkingLevelMap: map,
      note: "heuristic: kimi-k3",
    };
  }
  if (s.includes("kimi") || s.includes("k2")) {
    map.off = "disabled";
    map.high = "enabled";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 262_144,
      maxTokens: 262_144,
      thinkingLevelMap: map,
      note: "heuristic: kimi-k2",
    };
  }
  if (s.includes("claude") || s.includes("opus") || s.includes("sonnet") || s.includes("haiku")) {
    map.low = "low";
    map.medium = "medium";
    map.high = "high";
    map.xhigh = "xhigh";
    map.max = "max";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      thinkingLevelMap: map,
      note: "heuristic: claude",
    };
  }
  if (s.includes("gpt-5") || s.includes("o3") || s.includes("o4")) {
    map.off = "none";
    map.low = "low";
    map.medium = "medium";
    map.high = "high";
    map.xhigh = "xhigh";
    map.max = "max";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_050_000,
      maxTokens: 128_000,
      thinkingLevelMap: map,
      note: "heuristic: gpt-5",
    };
  }
  if (s.includes("gemini")) {
    map.low = "low";
    map.medium = "medium";
    map.high = "high";
    return {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      thinkingLevelMap: map,
      note: "heuristic: gemini",
    };
  }
  return {
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 16_384,
    note: "heuristic: default",
  };
}

export function isNonChatModality(id: string, official?: OfficialModel): boolean {
  const s = id.toLowerCase();
  if (/embed|whisper|tts|realtime|image|video|lyria|veo|imagine/.test(s)) return true;
  const out = official?.modalities?.output ?? [];
  if (out.some((m) => m === "audio" || m === "image" || m === "video")) {
    if (!out.includes("text")) return true;
  }
  if ((official?.limit?.output ?? 1) === 0) return true;
  return false;
}

export { hasEffort, hasToggle };
