import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { boundedFetch } from "./fetch.ts";
import { getModelsDevCachePath } from "./paths.ts";
import { writeSidecar } from "./sidecar.ts";
import type { OfficialCatalog, OfficialModel, OfficialProvider } from "./types.ts";
import { OFFICIAL_BUCKETS, isResellerBucket } from "./types.ts";

const MODELS_DEV_URL = "https://models.dev/api.json";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;

export interface CatalogCache {
  fetchedAt: string;
  etag?: string;
  official: OfficialCatalog;
}

const FIELDS = [
  "id",
  "name",
  "family",
  "reasoning",
  "reasoning_options",
  "interleaved",
  "modalities",
  "limit",
  "status",
  "release_date",
  "last_updated",
] as const;

export function extractOfficial(raw: unknown): OfficialCatalog {
  if (!raw || typeof raw !== "object") return {};
  const out: OfficialCatalog = {};
  for (const bucket of OFFICIAL_BUCKETS) {
    const provider = (raw as Record<string, unknown>)[bucket];
    if (!provider || typeof provider !== "object") continue;
    const modelsIn = (provider as { models?: Record<string, unknown> }).models ?? {};
    const models: Record<string, OfficialModel> = {};
    for (const [id, model] of Object.entries(modelsIn)) {
      if (!model || typeof model !== "object") continue;
      const src = model as Record<string, unknown>;
      const slim: OfficialModel = { id: typeof src.id === "string" ? src.id : id };
      for (const key of FIELDS) {
        if (key === "id") continue;
        if (key in src) (slim as Record<string, unknown>)[key] = src[key];
      }
      models[id] = slim;
    }
    out[bucket] = {
      id: bucket,
      name: typeof (provider as { name?: unknown }).name === "string" ? (provider as { name: string }).name : bucket,
      models,
    };
  }
  return out;
}

export function assertNoResellerKeys(catalog: OfficialCatalog): void {
  for (const key of Object.keys(catalog)) {
    if (isResellerBucket(key) && !(OFFICIAL_BUCKETS as readonly string[]).includes(key)) {
      throw new Error(`reseller bucket leaked into official index: ${key}`);
    }
  }
}

async function readCache(path: string): Promise<CatalogCache | undefined> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as CatalogCache;
    if (!parsed?.official || typeof parsed.official !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function writeCache(path: string, cache: CatalogCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache), { encoding: "utf8", mode: 0o600 });
}

export interface LoadOfficialOptions {
  force?: boolean;
  signal?: AbortSignal;
  cachePath?: string;
  fetchImpl?: typeof boundedFetch;
}

export interface LoadOfficialResult {
  catalog: OfficialCatalog;
  fetchedAt?: string;
  fromCache: boolean;
  stale: boolean;
  warning?: string;
}

export async function loadOfficialCatalog(opts: LoadOfficialOptions = {}): Promise<LoadOfficialResult> {
  const path = opts.cachePath ?? getModelsDevCachePath();
  const cached = await readCache(path);
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  const fresh = Number.isFinite(age) && age >= 0 && age < TTL_MS;

  if (cached && fresh && !opts.force) {
    return { catalog: cached.official, fetchedAt: cached.fetchedAt, fromCache: true, stale: false };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  const fetchFn = opts.fetchImpl ?? boundedFetch;
  try {
    const res = await fetchFn(MODELS_DEV_URL, {
      headers,
      signal: opts.signal,
      timeoutMs: 30_000,
      maxBytes: MAX_BYTES,
      redirect: "error",
    });
    if (res.status === 304 && cached) {
      const next = { ...cached, fetchedAt: new Date().toISOString() };
      await writeCache(path, next);
      if (!opts.cachePath) await writeSidecar({ cacheFetchedAt: next.fetchedAt });
      return { catalog: cached.official, fetchedAt: next.fetchedAt, fromCache: true, stale: false };
    }
    if (!res.ok || res.timedOut) {
      if (cached) {
        return {
          catalog: cached.official,
          fetchedAt: cached.fetchedAt,
          fromCache: true,
          stale: true,
          warning: res.timedOut ? "models.dev timed out; using stale cache" : `models.dev HTTP ${res.status}; using stale cache`,
        };
      }
      return { catalog: {}, fromCache: false, stale: false, warning: res.timedOut ? "models.dev timed out" : `models.dev HTTP ${res.status}` };
    }
    const raw = JSON.parse(res.text);
    const official = extractOfficial(raw);
    assertNoResellerKeys(official);
    const next: CatalogCache = {
      fetchedAt: new Date().toISOString(),
      etag: res.headers.get("etag") ?? cached?.etag,
      official,
    };
    await writeCache(path, next);
    if (!opts.cachePath) await writeSidecar({ cacheFetchedAt: next.fetchedAt });
    return { catalog: official, fetchedAt: next.fetchedAt, fromCache: false, stale: false };
  } catch (error) {
    if (cached) {
      return {
        catalog: cached.official,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        stale: true,
        warning: `models.dev failed (${error instanceof Error ? error.message : error}); using stale cache`,
      };
    }
    return {
      catalog: {},
      fromCache: false,
      stale: false,
      warning: `models.dev failed (${error instanceof Error ? error.message : error}); heuristics only`,
    };
  }
}

export function findOfficial(catalog: OfficialCatalog, bucket: string, id: string): OfficialModel | undefined {
  return catalog[bucket]?.models[id];
}

export type { OfficialProvider };
