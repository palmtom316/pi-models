import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { builtinOfficialIds, BUILTIN_CATALOG } from "../src/builtin-catalog.ts";
import { thinkingLevelMapFromOfficial } from "../src/defaults.ts";
import { matchOfficial, normalizeForMatch } from "../src/match.ts";
import { enrichUnknownDrafts, matchBuiltin, resolveDrafts } from "../src/resolve.ts";

const ALL = [
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-fable-5",
  "claude-sonnet-5",
  "grok-4.5",
  "grok-4.6",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "glm-5.2",
  "glm-5.3",
  "gemini-3.7-flash",
  "kimi-k3",
];

describe("builtin catalog", () => {
  it("pins every requested daily-driver id", () => {
    const ids = new Set(builtinOfficialIds());
    for (const id of ALL) assert.ok(ids.has(id), id);
  });

  it("matches listed ids and short aliases offline", () => {
    const cases: Array<[string, string]> = [
      ["gpt-5.5", "gpt-5.5"],
      ["gpt-5.6-sol", "gpt-5.6-sol"],
      ["gpt-5.6-terra", "gpt-5.6-terra"],
      ["gpt-5.6-luna", "gpt-5.6-luna"],
      ["claude-opus-5", "claude-opus-5"],
      ["opus-5", "claude-opus-5"],
      ["claude-opus-4.8", "claude-opus-4-8"],
      ["opus-4.8", "claude-opus-4-8"],
      ["claude-fable-5", "claude-fable-5"],
      ["fable-5", "claude-fable-5"],
      ["sonnet-5", "claude-sonnet-5"],
      ["grok-4.5", "grok-4.5"],
      ["grok-4.6", "grok-4.6"],
      ["deepseek-ai/deepseek-v4-flash-0731", "deepseek-v4-flash"],
      ["deepseek-v4-pro", "deepseek-v4-pro"],
      ["glm-5.2", "glm-5.2"],
      ["zai/glm-5.3", "glm-5.3"],
      ["gemini-3.7-flash", "gemini-3.7-flash"],
      ["kimi-k3", "kimi-k3"],
    ];
    for (const [raw, officialId] of cases) {
      const hit = matchBuiltin(raw);
      assert.equal(hit.kind, "official", raw);
      assert.equal(hit.source, "builtin", raw);
      assert.equal(hit.officialId, officialId, raw);
    }
  });

  it("does not fuzzy-match gpt-5 onto gpt-5.6", () => {
    const hit = matchBuiltin("gpt-5");
    assert.equal(hit.kind, "unmatched");
    assert.notEqual(normalizeForMatch("gpt-5"), "gpt-5.6-sol");
  });

  it("forces 1M context on every builtin Claude", () => {
    for (const id of ["claude-opus-5", "claude-opus-4-8", "claude-fable-5", "claude-sonnet-5"]) {
      assert.equal(BUILTIN_CATALOG.anthropic.models[id].limit?.context, 1_000_000, id);
    }
  });

  it("maps thinking levels from the builtin objects", () => {
    const gpt = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.openai.models["gpt-5.6-sol"]);
    assert.equal(gpt.off, "none");
    assert.equal(gpt.max, "max");

    const gpt55 = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.openai.models["gpt-5.5"]);
    assert.equal(gpt55.off, "none");
    assert.equal(gpt55.xhigh, "xhigh");
    assert.equal(gpt55.max, null);

    const opus = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.anthropic.models["claude-opus-5"]);
    assert.equal(opus.off, null);
    assert.equal(opus.max, "max");

    const sonnet = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.anthropic.models["claude-sonnet-5"]);
    assert.equal(sonnet.off, "disabled");

    const grok45 = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.xai.models["grok-4.5"]);
    assert.equal(grok45.high, "high");
    assert.equal(grok45.xhigh, null);

    const grok46 = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.xai.models["grok-4.6"]);
    assert.equal(grok46.xhigh, "xhigh");
    assert.equal(grok46.max, null);

    const glm52 = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.zhipuai.models["glm-5.2"]);
    assert.equal(glm52.off, "none");
    assert.equal(glm52.high, "high");
    assert.equal(glm52.low, null);

    const glm53 = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.zhipuai.models["glm-5.3"]);
    assert.equal(glm53.low, "low");
    assert.equal(glm53.max, "max");
    assert.equal(glm53.off, null);

    const kimi = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.moonshotai.models["kimi-k3"]);
    assert.equal(kimi.off, null);
    assert.equal(kimi.low, "low");
    assert.equal(kimi.max, "max");

    const pro = thinkingLevelMapFromOfficial(BUILTIN_CATALOG.deepseek.models["deepseek-v4-pro"]);
    assert.equal(pro.off, "disabled");
    assert.equal(pro.low, "low");
    assert.equal(pro.max, "max");
  });
});

describe("resolveDrafts builtin-first", () => {
  it("does not mark listed models as unknown", () => {
    const items = ALL.map((id) => ({ id }));
    const { drafts, unknownIds } = resolveDrafts(items, "openai-completions", "https://x/v1");
    assert.deepEqual(unknownIds, []);
    assert.equal(drafts.length, ALL.length);
    assert.ok(drafts.every((d) => d.match.source === "builtin"));
    const opus = drafts.find((d) => d.id === "claude-opus-5");
    assert.equal(opus?.contextWindow, 1_000_000);
    const kimi = drafts.find((d) => d.id === "kimi-k3");
    assert.equal(kimi?.thinkingLevelMap?.off, null);
  });

  it("copies builtin flash caps onto relay ids", () => {
    const { drafts, unknownIds } = resolveDrafts(
      [{ id: "deepseek-ai/deepseek-v4-flash-0731" }, { id: "deepseek-v4-flash-0731" }],
      "openai-completions",
      "https://wzw.pp.ua/v1",
    );
    assert.deepEqual(unknownIds, []);
    for (const draft of drafts) {
      assert.equal(draft.id.includes("0731"), true);
      assert.equal(draft.match.officialId, "deepseek-v4-flash");
      assert.equal(draft.contextWindow, 1_000_000);
      assert.equal(draft.maxTokens, 384_000);
      assert.equal(draft.thinkingLevelMap?.off, "disabled");
      assert.equal(draft.thinkingLevelMap?.low, "low");
      assert.equal(draft.thinkingLevelMap?.max, "max");
      assert.equal(draft.compat?.thinkingFormat, "deepseek");
    }
  });

  it("collects unknown ids instead of fetching", () => {
    const { drafts, unknownIds } = resolveDrafts(
      [{ id: "gpt-5.6-sol" }, { id: "qwen3.8-max" }],
      "openai-completions",
      "https://x/v1",
    );
    assert.deepEqual(unknownIds, ["qwen3.8-max"]);
    assert.equal(drafts[0]?.match.source, "builtin");
    assert.equal(drafts[1]?.match.kind, "unmatched");
  });

  it("fetches models.dev only for selected unknown ids", async () => {
    let fetches = 0;
    const { drafts, remote } = await enrichUnknownDrafts(
      [{ id: "gpt-5.6-sol" }, { id: "qwen3.8-max" }],
      "openai-completions",
      "https://x/v1",
      ["qwen3.8-max"],
      {
        cachePath: "/tmp/pim-models-test-models-dev.json",
        force: true,
        fetchImpl: async () => {
          fetches += 1;
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            text: JSON.stringify({
              alibaba: {
                id: "alibaba",
                name: "Alibaba",
                models: {
                  "qwen3.8-max": {
                    id: "qwen3.8-max",
                    name: "Qwen3.8 Max",
                    family: "qwen",
                    reasoning: true,
                    reasoning_options: [{ type: "effort", values: ["low", "high"] }],
                    limit: { context: 1_000_000, output: 131_072 },
                    modalities: { input: ["text"], output: ["text"] },
                  },
                },
              },
            }),
            truncated: false,
            timedOut: false,
          };
        },
      },
    );
    assert.equal(fetches, 1);
    assert.equal(remote?.fromCache, false);
    const qwen = drafts.find((d) => d.id === "qwen3.8-max");
    assert.equal(qwen?.match.kind, "official");
    assert.equal(qwen?.match.source, "models.dev");
    assert.equal(qwen?.match.officialId, "qwen3.8-max");
    assert.equal(qwen?.contextWindow, 1_000_000);
    const sol = drafts.find((d) => d.id === "gpt-5.6-sol");
    assert.equal(sol?.match.source, "builtin");
  });

  it("skips models.dev when every selected id is builtin", async () => {
    let fetches = 0;
    const { drafts } = await enrichUnknownDrafts(
      [{ id: "kimi-k3" }],
      "openai-completions",
      "https://x/v1",
      [],
      {
        fetchImpl: async () => {
          fetches += 1;
          throw new Error("should not fetch");
        },
      },
    );
    assert.equal(fetches, 0);
    assert.equal(drafts[0]?.match.source, "builtin");
    assert.equal(drafts[0]?.thinkingLevelMap?.max, "max");
  });
});

describe("matchOfficial fuzzy still works on a full catalog", () => {
  it("can still exact-match via official catalog helper", () => {
    const hit = matchOfficial("claude-opus-5", BUILTIN_CATALOG, { fuzzy: false, source: "builtin" });
    assert.equal(hit.officialId, "claude-opus-5");
  });
});
