import type { OfficialCatalog, OfficialModel } from "./types.ts";

const TEXT = { input: ["text"], output: ["text"] };
const TEXT_IMAGE = { input: ["text", "image", "pdf"], output: ["text"] };
const TEXT_IMAGE_VIDEO = { input: ["text", "image", "video"], output: ["text"] };
const GEMINI_IN = { input: ["text", "image", "video", "audio", "pdf"], output: ["text"] };

const INTERLEAVED = { field: "reasoning_content" } as const;

function model(spec: OfficialModel): OfficialModel {
  return { reasoning: true, ...spec };
}

/** Short / dotted ids that should hit a builtin official id after normalizeForMatch. */
export const BUILTIN_ALIASES: Record<string, string> = {
  "claude-opus-4.8": "claude-opus-4-8",
  "opus-4.8": "claude-opus-4-8",
  "opus-4-8": "claude-opus-4-8",
  "opus-5": "claude-opus-5",
  "fable-5": "claude-fable-5",
  "sonnet-5": "claude-sonnet-5",
};

/**
 * Offline pack for the models we actually add every day.
 * Caps from vendor docs + models.dev official buckets (checked 2026-08-17), except:
 * - every Claude entry is pinned to 1M context (user requirement)
 * - glm-5.3 is not in the zhipuai/zai lab buckets yet; pinned from Z.AI GLM-5.3 docs
 */
export const BUILTIN_CATALOG: OfficialCatalog = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5.5": model({
        id: "gpt-5.5",
        name: "GPT-5.5",
        family: "gpt",
        reasoning_options: [{ type: "effort", values: ["none", "low", "medium", "high", "xhigh"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_050_000, input: 922_000, output: 128_000 },
      }),
      "gpt-5.6-sol": model({
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        family: "gpt-sol",
        reasoning_options: [{ type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_050_000, input: 922_000, output: 128_000 },
      }),
      "gpt-5.6-terra": model({
        id: "gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        family: "gpt-terra",
        reasoning_options: [{ type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_050_000, input: 922_000, output: 128_000 },
      }),
      "gpt-5.6-luna": model({
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        family: "gpt-luna",
        reasoning_options: [{ type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_050_000, input: 922_000, output: 128_000 },
      }),
    },
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-opus-5": model({
        id: "claude-opus-5",
        name: "Claude Opus 5",
        family: "claude-opus",
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high", "xhigh", "max"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_000_000, output: 128_000 },
      }),
      "claude-opus-4-8": model({
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        family: "claude-opus",
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high", "xhigh", "max"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_000_000, output: 128_000 },
      }),
      "claude-fable-5": model({
        id: "claude-fable-5",
        name: "Claude Fable 5",
        family: "claude-fable",
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high", "xhigh", "max"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 1_000_000, output: 128_000 },
      }),
      "claude-sonnet-5": model({
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        family: "claude-sonnet",
        reasoning_options: [
          { type: "toggle" },
          { type: "effort", values: ["low", "medium", "high", "xhigh", "max"] },
        ],
        modalities: TEXT_IMAGE,
        limit: { context: 1_000_000, output: 128_000 },
      }),
    },
  },
  xai: {
    id: "xai",
    name: "xAI",
    models: {
      "grok-4.5": model({
        id: "grok-4.5",
        name: "Grok 4.5",
        family: "grok",
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 500_000, output: 500_000 },
      }),
      "grok-4.6": model({
        id: "grok-4.6",
        name: "Grok 4.6",
        family: "grok",
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high", "xhigh"] }],
        modalities: TEXT_IMAGE,
        limit: { context: 500_000, output: 500_000 },
      }),
    },
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    models: {
      "deepseek-v4-flash": model({
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        family: "deepseek-flash",
        reasoning_options: [{ type: "toggle" }, { type: "effort", values: ["low", "high", "max"] }],
        interleaved: INTERLEAVED,
        modalities: TEXT,
        limit: { context: 1_000_000, output: 384_000 },
      }),
      "deepseek-v4-pro": model({
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        family: "deepseek-thinking",
        // Official DeepSeek docs: flash and pro share the same effort map (low/high/max; medium→high).
        reasoning_options: [{ type: "toggle" }, { type: "effort", values: ["low", "high", "max"] }],
        interleaved: INTERLEAVED,
        modalities: TEXT,
        limit: { context: 1_000_000, output: 384_000 },
      }),
    },
  },
  zhipuai: {
    id: "zhipuai",
    name: "Zhipu AI",
    models: {
      "glm-5.2": model({
        id: "glm-5.2",
        name: "GLM-5.2",
        family: "glm",
        // Z.AI: none/minimal skip thinking; low/medium→high; xhigh→max. Expose the distinct values.
        reasoning_options: [{ type: "effort", values: ["none", "high", "max"] }],
        interleaved: INTERLEAVED,
        modalities: TEXT,
        limit: { context: 1_000_000, output: 131_072 },
      }),
      // Not in the 2026-08-17 zhipuai/zai lab buckets. Z.AI: cannot disable; low/high/max.
      "glm-5.3": model({
        id: "glm-5.3",
        name: "GLM-5.3",
        family: "glm",
        reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
        interleaved: INTERLEAVED,
        modalities: TEXT,
        limit: { context: 1_000_000, output: 131_072 },
      }),
    },
  },
  google: {
    id: "google",
    name: "Google",
    models: {
      "gemini-3.7-flash": model({
        id: "gemini-3.7-flash",
        name: "Gemini 3.7 Flash",
        family: "gemini-flash",
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high"] }],
        modalities: GEMINI_IN,
        limit: { context: 1_048_576, output: 65_536 },
      }),
    },
  },
  moonshotai: {
    id: "moonshotai",
    name: "Moonshot AI",
    models: {
      "kimi-k3": model({
        id: "kimi-k3",
        name: "Kimi K3",
        family: "kimi-k3",
        // Official K3: always thinks; no thinking.type. reasoning_effort low/high/max (default max).
        reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
        interleaved: INTERLEAVED,
        modalities: TEXT_IMAGE_VIDEO,
        limit: { context: 1_048_576, output: 131_072 },
      }),
    },
  },
};

export function builtinOfficialIds(): string[] {
  const ids: string[] = [];
  for (const provider of Object.values(BUILTIN_CATALOG)) {
    ids.push(...Object.keys(provider.models));
  }
  return ids;
}
