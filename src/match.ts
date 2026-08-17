import { BUILTIN_ALIASES } from "./builtin-catalog.ts";
import type { MatchHit, MatchSource, OfficialBucket, OfficialCatalog, OfficialModel } from "./types.ts";
import { OFFICIAL_BUCKETS } from "./types.ts";
import { isNonChatModality } from "./defaults.ts";

const VENDOR_PREFIXES = [
  "deepseek-ai/",
  "openai/",
  "anthropic/",
  "google/",
  "moonshotai/",
  "zai-org/",
  "z-ai/",
  "zai/",
  "zhipuai/",
  "qwen/",
  "alibaba/",
  "x-ai/",
  "xai/",
];

const SITE_SUFFIXES = ["-think", "-thinking", "-reasoner", ":thinking", ":reasoning"];

export function normalizeForMatch(raw: string): string {
  let s = raw.trim().toLowerCase();
  // keep last path segment if it looks like vendor/model
  for (const prefix of VENDOR_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
    const idx = s.indexOf(`/${prefix.slice(0, -1)}/`);
    if (idx >= 0) {
      s = s.slice(idx + 1 + prefix.length);
      break;
    }
  }
  // generic vendor/model: drop first segment if it is a known lab leftover
  if (s.includes("/")) {
    const parts = s.split("/");
    s = parts[parts.length - 1] ?? s;
  }
  for (const suf of SITE_SUFFIXES) {
    if (s.endsWith(suf)) s = s.slice(0, -suf.length);
  }
  s = s.replace(/-\d{4}$/, "");
  return BUILTIN_ALIASES[s] ?? s;
}

function tokens(id: string): string[] {
  return id.split(/[^a-z0-9]+/).filter(Boolean);
}

function scorePair(normalized: string, officialId: string): number {
  if (normalized === officialId) return 100;
  if (officialId.startsWith(normalized) || normalized.startsWith(officialId)) {
    const diff = Math.abs(normalized.length - officialId.length);
    if (diff <= 4) return 80 - diff;
    return 50 - Math.min(diff, 30);
  }
  if (officialId.includes(normalized) || normalized.includes(officialId)) {
    const diff = Math.abs(normalized.length - officialId.length);
    return 35 - Math.min(diff, 20);
  }
  const a = new Set(tokens(normalized));
  const b = tokens(officialId);
  if (a.size === 0 || b.length === 0) return 0;
  const overlap = b.filter((t) => a.has(t)).length;
  return (overlap / Math.max(a.size, b.length)) * 25;
}

interface Candidate {
  bucket: OfficialBucket;
  officialId: string;
  official: OfficialModel;
  score: number;
  exact: boolean;
}

function collectOfficial(catalog: OfficialCatalog): Candidate[] {
  const out: Candidate[] = [];
  for (const bucket of OFFICIAL_BUCKETS) {
    const provider = catalog[bucket];
    if (!provider?.models) continue;
    for (const [officialId, official] of Object.entries(provider.models)) {
      out.push({ bucket, officialId, official, score: 0, exact: false });
    }
  }
  return out;
}

export interface MatchOfficialOptions {
  fuzzy?: boolean;
  source?: MatchSource;
}

export function matchOfficial(remoteId: string, catalog: OfficialCatalog, opts: MatchOfficialOptions = {}): MatchHit {
  const normalized = normalizeForMatch(remoteId);
  const all = collectOfficial(catalog);
  const source = opts.source;

  const exact = all.find((c) => c.officialId.toLowerCase() === normalized);
  if (exact) {
    return {
      kind: "official",
      bucket: exact.bucket,
      officialId: exact.officialId,
      official: exact.official,
      score: 100,
      source,
    };
  }

  if (opts.fuzzy === false) {
    return { kind: "unmatched", score: 0, source };
  }

  const scored = all
    .map((c) => ({ ...c, score: scorePair(normalized, c.officialId.toLowerCase()) }))
    .filter((c) => c.score > 0 && !isNonChatModality(c.officialId, c.official))
    .sort((a, b) => b.score - a.score || OFFICIAL_BUCKETS.indexOf(a.bucket) - OFFICIAL_BUCKETS.indexOf(b.bucket));

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 55) {
    return { kind: "unmatched", score: best?.score ?? 0, source };
  }
  if (second && best.score - second.score < 8 && best.score < 80) {
    return {
      kind: "fuzzy",
      bucket: best.bucket,
      officialId: best.officialId,
      official: best.official,
      score: best.score,
      source,
    };
  }
  if (best.score >= 80) {
    return {
      kind: "official",
      bucket: best.bucket,
      officialId: best.officialId,
      official: best.official,
      score: best.score,
      source,
    };
  }
  return {
    kind: "fuzzy",
    bucket: best.bucket,
    officialId: best.officialId,
    official: best.official,
    score: best.score,
    source,
  };
}

export function matchLabel(hit: MatchHit): string {
  if (hit.kind === "official" && hit.source === "builtin") {
    return `✓ builtin ${hit.bucket}/${hit.officialId}`;
  }
  if (hit.kind === "official") return `✓ official ${hit.bucket}/${hit.officialId}`;
  if (hit.kind === "fuzzy") return `~ fuzzy ${hit.bucket}/${hit.officialId}`;
  return "? unmatched";
}
