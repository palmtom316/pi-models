import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  attributeEntry,
  buildReport,
  collectUsage,
  emptyTotals,
  foldEntries,
  formatTokens,
  listSessionFiles,
  rangeCutoff,
  splitKey,
  TOOLS_BUCKET,
  type UsageTotals,
} from "../src/usage.ts";
import {
  createUsageState,
  cycleSort,
  sortValue,
  usageColumns,
  usageDroppedColumns,
  visibleGroups,
} from "../src/ui/usage-view.ts";
import { setLang, t } from "../src/i18n.ts";
import type { PimUi } from "../src/ui/pim-ui.ts";

function assistant(provider: string, model: string, responseModel: string | undefined, usage: Record<string, number>) {
  return {
    type: "message",
    timestamp: "2026-10-10T10:00:00.000Z",
    message: {
      role: "assistant",
      provider,
      model,
      ...(responseModel ? { responseModel } : {}),
      usage: { cost: { total: 0 }, ...usage },
    },
  };
}

describe("usage attribution", () => {
  it("groups assistant messages by provider and responseModel", () => {
    const hit = attributeEntry(assistant("FENG", "deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash", { input: 10 }));
    assert.deepEqual(hit?.key, "FENG/deepseek/deepseek-v4.1-flash");
  });

  it("falls back to the requested model when responseModel is absent", () => {
    const hit = attributeEntry(assistant("WONG", "deepseek-v4.1-flash", undefined, { input: 10 }));
    assert.deepEqual(hit?.key, "WONG/deepseek-v4.1-flash");
  });

  it("routes toolResult, branch_summary and compaction usage into the summaries bucket", () => {
    const tool = attributeEntry({
      type: "message",
      message: { role: "toolResult", usage: { input: 1 } },
    });
    assert.equal(tool?.key, TOOLS_BUCKET);
    assert.equal(attributeEntry({ type: "branch_summary", usage: { input: 1 } })?.key, TOOLS_BUCKET);
    assert.equal(attributeEntry({ type: "compaction", usage: { input: 1 } })?.key, TOOLS_BUCKET);
  });

  it("attributes cache-warm usage entries to provider/model", () => {
    const hit = attributeEntry({ type: "usage", provider: "ELY", model: "glm-5.3", usage: { input: 2 } });
    assert.deepEqual(hit?.key, "ELY/glm-5.3");
  });

  it("ignores entries without usage", () => {
    assert.equal(attributeEntry({ type: "message", message: { role: "user" } }), undefined);
    assert.equal(attributeEntry({ type: "model_change" }), undefined);
  });

  it("splits a key on the first slash only", () => {
    assert.deepEqual(splitKey("FENG/deepseek/deepseek-v4.1-flash"), {
      provider: "FENG",
      model: "deepseek/deepseek-v4.1-flash",
    });
    assert.deepEqual(splitKey(TOOLS_BUCKET), { provider: TOOLS_BUCKET, model: "" });
  });
});

describe("usage folding", () => {
  it("sums the four token buckets and counts calls", () => {
    const byKey = new Map<string, UsageTotals>();
    foldEntries(
      [
        assistant("A", "m", "m", { input: 10, output: 2, cacheRead: 100, cacheWrite: 5, totalTokens: 117 }),
        assistant("A", "m", "m", { input: 20, output: 3, cacheRead: 200, cacheWrite: 0, totalTokens: 223 }),
      ],
      byKey,
    );
    const totals = byKey.get("A/m")!;
    assert.equal(totals.input, 30);
    assert.equal(totals.output, 5);
    assert.equal(totals.cacheRead, 300);
    assert.equal(totals.cacheWrite, 5);
    // pi's definition: input + output + cacheRead + cacheWrite
    assert.equal(totals.total, 340);
    assert.equal(totals.messages, 2);
  });

  it("falls back to totalTokens when a relay reports no split", () => {
    const byKey = new Map<string, UsageTotals>();
    foldEntries([assistant("A", "m", "m", { totalTokens: 999 })], byKey);
    assert.equal(byKey.get("A/m")!.total, 999);
  });

  it("skips failed/aborted turns that carry an all-zero usage block", () => {
    const byKey = new Map<string, UsageTotals>();
    foldEntries(
      [
        assistant("A", "m", "m", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }),
        assistant("A", "m", "m", { input: 10 }),
      ],
      byKey,
    );
    assert.equal(byKey.get("A/m")!.messages, 1);
    assert.equal(byKey.get("A/m")!.total, 10);
  });

  it("drops entries older than the range cutoff", () => {
    const byKey = new Map<string, UsageTotals>();
    foldEntries(
      [
        { ...assistant("A", "m", "m", { input: 5 }), timestamp: "2026-01-01T00:00:00.000Z" },
        { ...assistant("A", "m", "m", { input: 7 }), timestamp: "2026-10-15T00:00:00.000Z" },
      ],
      byKey,
      { since: Date.parse("2026-10-01T00:00:00.000Z") },
    );
    assert.equal(byKey.get("A/m")!.input, 7);
    assert.equal(byKey.get("A/m")!.messages, 1);
  });

  it("builds provider rollups sorted by total", () => {
    const byKey = new Map<string, UsageTotals>([
      ["A/small", { ...emptyTotals(), input: 1, total: 1, messages: 1 }],
      ["B/big", { ...emptyTotals(), input: 100, total: 100, messages: 1 }],
      ["B/big2", { ...emptyTotals(), input: 50, total: 50, messages: 1 }],
    ]);
    const report = buildReport(byKey, { sessionDir: "/tmp", sessionFiles: 2, latest: 0 });
    assert.deepEqual(report.providers.map((p) => p.provider), ["B", "A"]);
    assert.equal(report.providers[0]!.total, 150);
    assert.equal(report.totals.total, 151);
    assert.equal(report.groups[0]!.key, "B/big");
  });

  it("formats token counts compactly", () => {
    assert.equal(formatTokens(0), "0");
    assert.equal(formatTokens(999), "999");
    assert.equal(formatTokens(1500), "1.5K");
    assert.equal(formatTokens(2_500_000), "2.50M");
    assert.equal(formatTokens(3_000_000_000), "3.00B");
  });

  it("maps ranges to cutoffs", () => {
    const now = Date.parse("2026-10-17T00:00:00.000Z");
    assert.equal(rangeCutoff("all", now), 0);
    assert.equal(rangeCutoff("7d", now), now - 7 * 86400000);
    assert.equal(rangeCutoff("30d", now), now - 30 * 86400000);
  });
});

describe("usage scan", () => {
  async function fixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pim-usage-"));
    const nested = join(dir, "--Users-someone-projects-demo--");
    await mkdir(nested, { recursive: true });
    const lines = [
      { type: "session", version: 3, id: "s1" },
      assistant("FENG", "deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash", { input: 100, output: 10, cacheRead: 1000 }),
      { type: "message", message: { role: "user", content: "hi" } },
      { type: "message", message: { role: "toolResult", usage: { input: 3, output: 1 } } },
    ];
    await writeFile(join(nested, "2026-10-10T00-00-00-000Z_abc.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf8");
    // Corrupt line must not break the scan.
    await writeFile(join(nested, "broken.jsonl"), "{not json}\n", "utf8");
    return dir;
  }

  it("lists nested session files and skips unreadable ones", async () => {
    const dir = await fixture();
    const files = await listSessionFiles(dir);
    assert.equal(files.length, 2);
  });

  it("aggregates a directory into a report", async () => {
    const dir = await fixture();
    const report = await collectUsage({ sessionDir: dir });
    assert.equal(report.sessionFiles, 2);
    assert.equal(report.totals.input, 103);
    assert.equal(report.totals.output, 11);
    assert.equal(report.totals.cacheRead, 1000);
    assert.equal(report.totals.total, 1114);
    assert.equal(report.totals.messages, 2);
    assert.deepEqual(report.providers.map((p) => p.provider).sort(), ["FENG", TOOLS_BUCKET]);
  });

  it("returns an empty report for a missing directory", async () => {
    const report = await collectUsage({ sessionDir: join(tmpdir(), "pim-usage-does-not-exist-xyz") });
    assert.equal(report.sessionFiles, 0);
    assert.equal(report.totals.total, 0);
    assert.deepEqual(report.groups, []);
  });
});

describe("usage view state", () => {
  it("sorts providers by the active column", () => {
    const byKey = new Map<string, UsageTotals>([
      ["A/x", { ...emptyTotals(), input: 5, output: 500, total: 505, messages: 1 }],
      ["B/y", { ...emptyTotals(), input: 900, output: 1, total: 901, messages: 9 }],
    ]);
    const report = buildReport(byKey, { sessionDir: "", sessionFiles: 0, latest: 0 });
    const state = createUsageState();
    assert.deepEqual(visibleGroups(report, state).map((g) => g.provider), ["B", "A"]);
    state.sort = "output";
    assert.deepEqual(visibleGroups(report, state).map((g) => g.provider), ["A", "B"]);
    state.sort = "messages";
    assert.equal(sortValue(visibleGroups(report, state)[0]!, "messages"), 9);
  });

  it("drills from providers into that provider's models", () => {
    const byKey = new Map<string, UsageTotals>([
      ["A/x", { ...emptyTotals(), total: 10, messages: 1 }],
      ["A/y", { ...emptyTotals(), total: 90, messages: 1 }],
      ["B/z", { ...emptyTotals(), total: 50, messages: 1 }],
    ]);
    const report = buildReport(byKey, { sessionDir: "", sessionFiles: 0, latest: 0 });
    const state = createUsageState();
    state.level = "models";
    state.provider = "A";
    assert.deepEqual(visibleGroups(report, state).map((g) => g.model), ["y", "x"]);
  });

  it("drops numeric columns on narrow terminals but keeps the name column", () => {
    const wide = usageColumns(80);
    assert.equal(wide.length, 6);
    assert.deepEqual(usageDroppedColumns(80), []);
    const narrow = usageColumns(30);
    assert.ok(narrow.length < wide.length);
    assert.equal(narrow[0]!.key, "name");
    assert.ok(narrow[0]!.width >= 12);
    for (const column of narrow) assert.ok(column.width > 0);
    // Whatever was dropped is reported to the user instead of vanishing silently.
    const dropped = usageDroppedColumns(30);
    assert.ok(dropped.length > 0);
    assert.match(t().usageHiddenColumns(dropped), /narrow/);
  });

  it("keeps the cursor in place when the sort column changes", () => {
    const state = createUsageState();
    state.cursor = 4;
    state.offset = 2;
    cycleSort(state, 1);
    assert.equal(state.sort, "input");
    assert.equal(state.cursor, 4);
    assert.equal(state.offset, 2);
  });

  it("exposes usage strings in both languages", () => {
    setLang("en");
    assert.match(t().usageSummary("1M", "1M", "0", "0", 3, 2), /1M/);
    setLang("zh");
    assert.match(t().usageFooterProviders, /esc/);
    assert.match(t().usageLevelModels("FENG"), /FENG/);
    setLang("en");
  });
});

describe("usage wizard wiring", () => {
  it("scans the resolved session dir and closes the table without writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-usage-flow-"));
    const nested = join(dir, "--proj--");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, "s.jsonl"),
      `${JSON.stringify(assistant("FENG", "m", "m", { input: 40, output: 2 }))}\n`,
      "utf8",
    );

    const calls: string[] = [];
    let visit = 0;
    let rangeAsks = 0;
    const ui = {
      // Second time round the picker the user backs out with Esc.
      select: async () => (rangeAsks++ === 0 ? "all" : undefined),
      loader: async (title: string, work: (signal: AbortSignal) => Promise<unknown>, fallback: unknown) => {
        calls.push(title);
        return (await work(new AbortController().signal)) ?? fallback;
      },
      notify: () => undefined,
    };
    // First visit: "r" asks for a rescan. Second visit: esc returns to the range picker.
    const custom = (factory: Function) =>
      new Promise((resolve) => {
        visit += 1;
        const keys = visit === 1 ? ["r"] : ["\u001b"];
        const done = (value: string) => {
          calls.push(`done:${value}`);
          resolve(value);
        };
        const component = factory(
          { requestRender: () => undefined, terminal: { rows: 30 } },
          { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s },
          {},
          done,
        );
        component.render(70);
        for (const key of keys) component.handleInput(key);
      });
    const pimUi = { ...ui, ui: { notify: () => undefined, custom } } as unknown as PimUi;

    const { wizardTokenUsage, resolveSessionDir } = await import("../src/usage-wizard.ts");
    assert.equal(resolveSessionDir({ sessionManager: { getSessionDir: () => dir } }), dir);
    await wizardTokenUsage(pimUi, { sessionManager: { getSessionDir: () => dir } });
    // one scan + one rescan, then Esc backs out to the picker and the picker is cancelled
    assert.equal(calls.filter((c) => c === t().usageScanning).length, 2);
    assert.ok(calls.includes("done:refresh"));
    assert.ok(calls.includes("done:back"));
    assert.equal(rangeAsks, 2);
  });
});
