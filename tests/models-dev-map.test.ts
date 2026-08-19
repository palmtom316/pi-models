import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { modelCompatFromMatch, thinkingLevelMapFromOfficial } from "../src/defaults.ts";
import { buildDraft } from "../src/drafts.ts";
import { extractOfficial } from "../src/models-dev.ts";
import { matchOfficial } from "../src/match.ts";
import type { OfficialCatalog } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const snippet = JSON.parse(readFileSync(join(here, "fixtures/official-snippet.json"), "utf8"));
const catalog = extractOfficial(snippet) as OfficialCatalog;

describe("thinkingLevelMapFromOfficial", () => {
  it("maps gpt-5.6-sol off to none", () => {
    const map = thinkingLevelMapFromOfficial(catalog.openai.models["gpt-5.6-sol"]);
    assert.equal(map.off, "none");
    assert.equal(map.low, "low");
    assert.equal(map.max, "max");
    assert.equal(map.minimal, null);
  });

  it("maps opus 5 with no off", () => {
    const map = thinkingLevelMapFromOfficial(catalog.anthropic.models["claude-opus-5"]);
    assert.equal(map.off, null);
    assert.equal(map.low, "low");
    assert.equal(map.max, "max");
  });

  it("maps sonnet 5 toggle + efforts", () => {
    const map = thinkingLevelMapFromOfficial(catalog.anthropic.models["claude-sonnet-5"]);
    assert.equal(map.off, "disabled");
    assert.equal(map.high, "high");
  });

  it("maps gemini 3.7 only low/medium/high", () => {
    const map = thinkingLevelMapFromOfficial(catalog.google.models["gemini-3.7-flash"]);
    assert.equal(map.off, null);
    assert.equal(map.minimal, null);
    assert.equal(map.low, "low");
    assert.equal(map.high, "high");
    assert.equal(map.max, null);
  });

  it("maps kimi-k3 toggle + low/high/max", () => {
    const map = thinkingLevelMapFromOfficial(catalog.moonshotai.models["kimi-k3"]);
    assert.equal(map.off, "disabled");
    assert.equal(map.low, "low");
    assert.equal(map.high, "high");
    assert.equal(map.max, "max");
  });

  it("maps deepseek flash toggle + low/high/max", () => {
    const map = thinkingLevelMapFromOfficial(catalog.deepseek.models["deepseek-v4-flash"]);
    assert.equal(map.off, "disabled");
    assert.equal(map.low, "low");
    assert.equal(map.max, "max");
  });

  it("maps glm-5.2 high+max", () => {
    const map = thinkingLevelMapFromOfficial(catalog.zhipuai.models["glm-5.2"]);
    assert.equal(map.high, "high");
    assert.equal(map.max, "max");
    assert.equal(map.low, null);
  });

  it("maps grok-4.6 with xhigh and no max", () => {
    const map = thinkingLevelMapFromOfficial(catalog.xai.models["grok-4.6"]);
    assert.equal(map.xhigh, "xhigh");
    assert.equal(map.max, null);
  });
});

describe("modelCompatFromMatch", () => {
  it("sets adaptive thinking for claude 5 on anthropic-messages", () => {
    const hit = matchOfficial("claude-opus-5", catalog);
    const compat = modelCompatFromMatch("anthropic-messages", hit);
    assert.equal(compat?.forceAdaptiveThinking, true);
    assert.equal(compat?.thinkingFormat, undefined);
  });

  it("uses zai thinking for glm on openai-completions", () => {
    const hit = matchOfficial("glm-5.2", catalog);
    const compat = modelCompatFromMatch("openai-completions", hit);
    assert.equal(compat?.thinkingFormat, "zai");
  });

  it("uses deepseek thinking for official flash", () => {
    const hit = matchOfficial("deepseek-v4-flash-0731", catalog);
    const compat = modelCompatFromMatch("openai-completions", hit);
    assert.equal(compat?.thinkingFormat, "deepseek");
  });

  it("uses OpenAI effort semantics for Kimi K3", () => {
    const hit = matchOfficial("kimi-k3", catalog);
    const compat = modelCompatFromMatch("openai-completions", hit);
    assert.equal(compat?.thinkingFormat, "openai");
    assert.equal(compat?.requiresReasoningContentOnAssistantMessages, true);
  });

  it("does not force adaptive thinking on old Claude generations", () => {
    const compat = modelCompatFromMatch("anthropic-messages", {
      kind: "official",
      bucket: "anthropic",
      officialId: "claude-sonnet-4-5",
      official: { id: "claude-sonnet-4-5", family: "claude-sonnet" },
    });
    assert.equal(compat?.forceAdaptiveThinking, undefined);
  });

  it("enables adaptive thinking at the Claude 4.6 boundary", () => {
    const compat = modelCompatFromMatch("anthropic-messages", {
      kind: "official",
      bucket: "anthropic",
      officialId: "claude-opus-4-6",
      official: { id: "claude-opus-4-6", family: "claude-opus" },
    });
    assert.equal(compat?.forceAdaptiveThinking, true);
  });

  it("does not treat a Claude 4 date suffix as a 4.6+ minor version", () => {
    const compat = modelCompatFromMatch("anthropic-messages", {
      kind: "official",
      bucket: "anthropic",
      officialId: "claude-sonnet-4-20250514",
      official: { id: "claude-sonnet-4-20250514", family: "claude-sonnet" },
    });
    assert.equal(compat?.forceAdaptiveThinking, undefined);
  });

  it("does not treat Claude 3.5 as a 4.6+ adaptive model", () => {
    const compat = modelCompatFromMatch("anthropic-messages", {
      kind: "official",
      bucket: "anthropic",
      officialId: "claude-3-5-sonnet",
      official: { id: "claude-3-5-sonnet", family: "claude" },
    });
    assert.equal(compat?.forceAdaptiveThinking, undefined);
  });
});

describe("buildDraft", () => {
  it("keeps upstream id and copies official flash caps", () => {
    const draft = buildDraft(
      { id: "deepseek-ai/deepseek-v4-flash-0731" },
      "openai-completions",
      "https://wzw.pp.ua/v1",
      catalog,
    );
    assert.equal(draft.id, "deepseek-ai/deepseek-v4-flash-0731");
    assert.equal(draft.match.officialId, "deepseek-v4-flash");
    assert.equal(draft.contextWindow, 1_000_000);
    assert.equal(draft.maxTokens, 384_000);
    assert.equal(draft.compat?.thinkingFormat, "deepseek");
  });

  it("does not write cost", () => {
    const draft = buildDraft({ id: "gpt-5.6-sol" }, "openai-completions", "https://x/v1", catalog);
    assert.equal("cost" in draft, false);
  });

  it("keeps official text-only modalities instead of heuristic image input", () => {
    const remote: OfficialCatalog = {
      openai: {
        id: "openai",
        models: {
          "o3-mini": {
            id: "o3-mini",
            reasoning: true,
            modalities: { input: ["text"] },
            limit: { context: 200_000, output: 100_000 },
          },
        },
      },
    };
    const draft = buildDraft({ id: "o3-mini" }, "openai-completions", "https://x/v1", remote);
    assert.deepEqual(draft.input, ["text"]);
  });
});
