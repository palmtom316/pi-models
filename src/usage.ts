import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Token usage aggregation across every session file pi has written.
 *
 * Grouping follows pi's own `getUsageCostBreakdown` (dist/core/usage-totals.js):
 * - assistant messages -> `${provider}/${responseModel ?? model}`
 * - `type:"usage"` entries (cache warm) -> `${provider}/${model}`
 * - toolResult / branch_summary / compaction usage -> `Tools/summaries`
 * Tokens are `input + output + cacheRead + cacheWrite`; cost is summed but
 * relays almost never report it, so the UI treats it as optional.
 */

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  messages: number;
}

export interface UsageGroup extends UsageTotals {
  /** `provider/model` for model traffic, `Tools/summaries` for internal work. */
  key: string;
  provider: string;
  model: string;
}

export interface UsageReport {
  groups: UsageGroup[];
  totals: UsageTotals;
  /** `provider` -> summed totals across all of its models. */
  providers: UsageGroup[];
  sessionDir: string;
  sessionFiles: number;
  /** Epoch millis of the newest counted entry, 0 when nothing was counted. */
  latest: number;
}

/** Time window presets offered by the usage view. */
export type UsageRange = "all" | "7d" | "30d";

export const TOOLS_BUCKET = "Tools/summaries";

export function emptyTotals(): UsageTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0, messages: 0 };
}

export function rangeCutoff(range: UsageRange, now = Date.now()): number {
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

type RawUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { total?: number };
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Token count pi attributes to one request: the four buckets, else totalTokens. */
export function usageTokens(usage: RawUsage): number {
  const split = num(usage.input) + num(usage.output) + num(usage.cacheRead) + num(usage.cacheWrite);
  return split > 0 ? split : num(usage.totalTokens);
}

function addUsage(target: UsageTotals, usage: RawUsage, total: number): void {
  target.input += num(usage.input);
  target.output += num(usage.output);
  target.cacheRead += num(usage.cacheRead);
  target.cacheWrite += num(usage.cacheWrite);
  target.cost += num(usage.cost?.total);
  target.total += total;
  target.messages += 1;
}

/** `provider/model` split that keeps the `Tools/summaries` bucket intact. */
export function splitKey(key: string): { provider: string; model: string } {
  if (key === TOOLS_BUCKET) return { provider: TOOLS_BUCKET, model: "" };
  const slash = key.indexOf("/");
  if (slash <= 0) return { provider: key, model: "" };
  return { provider: key.slice(0, slash), model: key.slice(slash + 1) };
}

function entryTimestamp(entry: { timestamp?: unknown }): number {
  const raw = entry.timestamp;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof raw === "number") return raw;
  return 0;
}

type JsonEntry = Record<string, unknown> & {
  type?: string;
  timestamp?: unknown;
  message?: Record<string, unknown> & { role?: string; usage?: RawUsage; provider?: string; model?: string; responseModel?: string };
  usage?: RawUsage;
  provider?: string;
  model?: string;
};

/** Attribute one parsed session entry, mirroring pi's own breakdown rules. */
export function attributeEntry(entry: JsonEntry): { key: string; usage: RawUsage } | undefined {
  const message = entry.message;
  if (entry.type === "message" && message?.role === "assistant" && message.usage) {
    const model = message.responseModel || message.model || "?";
    return { key: `${message.provider ?? "?"}/${model}`, usage: message.usage };
  }
  if (entry.type === "usage" && entry.usage) {
    return { key: `${entry.provider ?? "?"}/${entry.model ?? "?"}`, usage: entry.usage };
  }
  if (entry.type === "message" && message?.role === "toolResult" && message.usage) {
    return { key: TOOLS_BUCKET, usage: message.usage };
  }
  if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
    return { key: TOOLS_BUCKET, usage: entry.usage };
  }
  return undefined;
}

/** Fold a batch of already-parsed session entries into `byKey`. */
export function foldEntries(
  entries: Iterable<JsonEntry>,
  byKey: Map<string, UsageTotals>,
  options: { since?: number } = {},
): number {
  const since = options.since ?? 0;
  let latest = 0;
  for (const entry of entries) {
    const attributed = attributeEntry(entry);
    if (!attributed) continue;
    // Failed and aborted turns still write an all-zero usage block. pi filters
    // those out (cost === 0 && tokens === 0), so they must not count as calls.
    const total = usageTokens(attributed.usage);
    if (total <= 0) continue;
    const stamp = entryTimestamp(entry);
    if (stamp && stamp < since) continue;
    let totals = byKey.get(attributed.key);
    if (!totals) {
      totals = emptyTotals();
      byKey.set(attributed.key, totals);
    }
    addUsage(totals, attributed.usage, total);
    if (stamp > latest) latest = stamp;
  }
  return latest;
}

function sumTotals(target: UsageTotals, source: UsageTotals): void {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.total += source.total;
  target.cost += source.cost;
  target.messages += source.messages;
}

export function sortGroups(groups: UsageGroup[]): UsageGroup[] {
  return groups.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** Build the final report shape from raw per-key totals. */
export function buildReport(
  byKey: Map<string, UsageTotals>,
  meta: { sessionDir: string; sessionFiles: number; latest: number },
): UsageReport {
  const groups: UsageGroup[] = [];
  const totals = emptyTotals();
  for (const [key, totalsFor] of byKey) {
    const { provider, model } = splitKey(key);
    groups.push({ key, provider, model, ...totalsFor });
    sumTotals(totals, totalsFor);
  }
  const providerTotals = new Map<string, UsageTotals>();
  for (const group of groups) {
    let bucket = providerTotals.get(group.provider);
    if (!bucket) {
      bucket = emptyTotals();
      providerTotals.set(group.provider, bucket);
    }
    sumTotals(bucket, group);
  }
  const providers: UsageGroup[] = [];
  for (const [provider, totalsFor] of providerTotals) {
    providers.push({ key: provider, provider, model: "", ...totalsFor });
  }
  return {
    groups: sortGroups(groups),
    providers: sortGroups(providers),
    totals,
    sessionDir: meta.sessionDir,
    sessionFiles: meta.sessionFiles,
    latest: meta.latest,
  };
}

/** Collect every `*.jsonl` under `dir` (pi nests one directory per cwd). */
export async function listSessionFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSessionFiles(full)));
    } else if (entry.isSymbolicLink()) {
      try {
        out.push(...(await listSessionFiles(full)));
      } catch {
        /* dangling link */
      }
    } else if (entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

/** Parse one JSONL session file into entries, skipping malformed lines. */
export async function readSessionEntries(path: string): Promise<JsonEntry[]> {
  const text = await readFile(path, "utf8");
  const out: JsonEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") out.push(parsed as JsonEntry);
    } catch {
      /* partial or corrupt line — ignore */
    }
  }
  return out;
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

/** Scan every session file under `sessionDir` and aggregate token usage. */
export async function collectUsage(options: {
  sessionDir: string;
  range?: UsageRange;
  now?: number;
  signal?: AbortSignal;
}): Promise<UsageReport> {
  const { sessionDir, range = "all", now = Date.now(), signal } = options;
  const since = rangeCutoff(range, now);
  const files = await listSessionFiles(sessionDir);
  const byKey = new Map<string, UsageTotals>();
  let latest = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    let entries: JsonEntry[];
    try {
      entries = await readSessionEntries(file);
    } catch {
      continue;
    }
    const fileLatest = foldEntries(entries, byKey, { since });
    if (fileLatest > latest) latest = fileLatest;
  }
  signal?.throwIfAborted();
  return buildReport(byKey, { sessionDir, sessionFiles: files.length, latest });
}
