export const PI_APIS = [
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;

export type PiApi = (typeof PI_APIS)[number];

export const OPENAI_APIS: readonly PiApi[] = [
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
];

export function isOpenAiApi(api: string): boolean {
  return OPENAI_APIS.includes(api as PiApi);
}

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

export const OFFICIAL_BUCKETS = [
  "openai",
  "anthropic",
  "google",
  "moonshotai",
  "deepseek",
  "xai",
  "zhipuai",
  "zai",
  "alibaba",
  "minimax",
  "xiaomi",
] as const;

export type OfficialBucket = (typeof OFFICIAL_BUCKETS)[number];

export const RESELLER_BUCKETS = new Set([
  "openrouter",
  "ai-router",
  "nano-gpt",
  "hpc-ai",
  "qiniu-ai",
]);

export function isResellerBucket(id: string): boolean {
  if (RESELLER_BUCKETS.has(id)) return true;
  if (id.endsWith("-token-plan") || id.endsWith("-coding-plan")) return true;
  if (id.endsWith("-cn") && id !== "minimax") return true;
  return false;
}

export type MatchKind = "official" | "fuzzy" | "unmatched";
export type MatchSource = "builtin" | "models.dev";

export interface ReasoningOption {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
}

export interface OfficialModel {
  id: string;
  name?: string;
  family?: string;
  reasoning?: boolean;
  reasoning_options?: ReasoningOption[];
  interleaved?: boolean | { field?: string };
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; input?: number; output?: number };
  status?: string;
  release_date?: string;
  last_updated?: string;
}

export interface OfficialProvider {
  id: string;
  name?: string;
  models: Record<string, OfficialModel>;
}

export type OfficialCatalog = Record<string, OfficialProvider>;

export interface MatchHit {
  kind: MatchKind;
  bucket?: OfficialBucket;
  officialId?: string;
  official?: OfficialModel;
  score?: number;
  source?: MatchSource;
}

export interface ModelCompat {
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsLongCacheRetention?: boolean;
  thinkingFormat?: string;
  requiresReasoningContentOnAssistantMessages?: boolean;
  forceAdaptiveThinking?: boolean;
  deferredToolsMode?: string;
  [key: string]: unknown;
}

export interface ModelRecord {
  id: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input?: Array<"text" | "image">;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    tiers?: unknown[];
  };
  contextWindow?: number;
  maxTokens?: number;
  samplingParams?: Record<string, unknown>;
  headers?: Record<string, string>;
  compat?: ModelCompat;
}

export interface ProviderRecord {
  name?: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  oauth?: string;
  headers?: Record<string, string>;
  compat?: ModelCompat;
  authHeader?: boolean;
  models?: ModelRecord[];
  modelOverrides?: Record<string, unknown>;
}

export interface ModelsFile {
  providers: Record<string, ProviderRecord>;
}

export interface ModelDraft {
  id: string;
  name: string;
  api: PiApi;
  baseUrl: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: ModelCompat;
  match: MatchHit;
  /** User chose to replace an existing same-id model. */
  replaceExisting?: boolean;
}

export type ConflictChoice = "keep" | "replace" | "skip";

export interface IdConflict {
  id: string;
  existing?: { api?: string; baseUrl?: string };
  incoming: { api: string; baseUrl: string };
}

export interface WizardApi {
  api: PiApi;
  baseUrl: string;
  userAgent: boolean;
  drafts: ModelDraft[];
}
