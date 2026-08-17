import { boundedFetch, truncateForNotify } from "./fetch.ts";
import type { PiApi } from "./types.ts";
import { catalogCandidates, looksLikeHtml, suggestV1 } from "./url.ts";

export interface CatalogItem {
  id: string;
  name?: string;
}

export interface CatalogResult {
  ok: boolean;
  items: CatalogItem[];
  tried: string[];
  status?: number;
  error?: string;
  suggestV1?: string;
  html?: boolean;
}

function asId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export function parseCatalogBody(text: string): CatalogItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const items: CatalogItem[] = [];
  const push = (id: string, name?: string) => {
    if (!id) return;
    let clean = id;
    if (clean.startsWith("models/")) clean = clean.slice("models/".length);
    items.push({ id: clean, name });
  };

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const id = asId((row as { id?: unknown }).id) ?? asId((row as { name?: unknown }).name);
        if (id) push(id, asId((row as { display_name?: unknown }).display_name) ?? asId((row as { name?: unknown }).name));
      }
    }
    return items;
  }

  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.data)) {
    for (const row of obj.data) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const id = asId((row as { id?: unknown }).id);
        if (id) {
          push(id, asId((row as { display_name?: unknown }).display_name) ?? asId((row as { name?: unknown }).name));
        }
      }
    }
    return items;
  }

  if (Array.isArray(obj.models)) {
    for (const row of obj.models) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const id =
          asId((row as { id?: unknown }).id) ??
          asId((row as { name?: unknown }).name);
        if (id) push(id, asId((row as { display_name?: unknown }).display_name));
      }
    }
    return items;
  }

  return items;
}

export async function fetchCatalog(opts: {
  api: PiApi;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
  userAgent?: boolean;
}): Promise<CatalogResult> {
  const tried: string[] = [];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    Accept: "application/json",
  };
  if (opts.userAgent !== false) headers["User-Agent"] = "node";
  if (opts.api === "anthropic-messages") {
    headers["x-api-key"] = opts.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  let lastStatus: number | undefined;
  let lastBody = "";
  let sawHtml = false;

  for (const url of catalogCandidates(opts.api, opts.baseUrl)) {
    tried.push(url);
    try {
      const res = await boundedFetch(url, {
        headers,
        signal: opts.signal,
        timeoutMs: 20_000,
        maxBytes: 2 * 1024 * 1024,
        redirect: "manual",
      });
      lastStatus = res.status;
      lastBody = res.text;
      if (res.timedOut) {
        return { ok: false, items: [], tried, error: "timeout" };
      }
      if (res.status >= 300 && res.status < 400) {
        return { ok: false, items: [], tried, status: res.status, error: `redirect ${res.status}` };
      }
      if (looksLikeHtml(res.text)) {
        sawHtml = true;
        continue;
      }
      if (!res.ok) continue;
      const items = parseCatalogBody(res.text);
      return { ok: true, items, tried, status: res.status };
    } catch (error) {
      lastBody = error instanceof Error ? error.message : String(error);
    }
  }

  const v1 = suggestV1(opts.api, opts.baseUrl);
  return {
    ok: false,
    items: [],
    tried,
    status: lastStatus,
    html: sawHtml,
    suggestV1: sawHtml ? v1 : v1,
    error: lastStatus
      ? `HTTP ${lastStatus}: ${truncateForNotify(lastBody)}`
      : truncateForNotify(lastBody || "catalog fetch failed"),
  };
}

export function parseManualIds(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
