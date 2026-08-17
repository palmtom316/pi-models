import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PROVIDER_COMPAT } from "./defaults.ts";
import { backupName, getModelsJsonPath, getProviderBackupDir, getProviderBackupPath, providerBackupId } from "./paths.ts";
import type { ModelDraft, ModelRecord, ModelsFile, ProviderRecord } from "./types.ts";
import { isOpenAiApi } from "./types.ts";
import { canonicalizeUrl, sameEndpoint } from "./url.ts";

const FILE_MODE = 0o600;
const KEEP_BACKUPS = 10;

const MODEL_KEYS = new Set([
  "id",
  "name",
  "api",
  "baseUrl",
  "reasoning",
  "thinkingLevelMap",
  "input",
  "cost",
  "contextWindow",
  "maxTokens",
  "samplingParams",
  "headers",
  "compat",
]);

const PROVIDER_KEYS = new Set([
  "name",
  "baseUrl",
  "api",
  "apiKey",
  "oauth",
  "headers",
  "compat",
  "authHeader",
  "models",
  "modelOverrides",
]);

const THINKING_SINK_KEYS = ["thinkingFormat", "requiresReasoningContentOnAssistantMessages"] as const;

export function emptyModelsFile(): ModelsFile {
  return { providers: {} };
}

export function parseModelsFile(text: string): ModelsFile {
  const parsed = JSON.parse(stripJsonComments(text)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("models.json must be an object");
  }
  const providers = (parsed as { providers?: unknown }).providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    throw new Error("models.json.providers must be an object");
  }
  return parsed as ModelsFile;
}

function stripJsonComments(text: string): string {
  let out = "";
  let quote = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quote = false;
      continue;
    }
    if (ch === '"') {
      quote = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      if (i < text.length) out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") out += "\n";
        i++;
      }
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

export async function readModelsFile(path = getModelsJsonPath()): Promise<ModelsFile> {
  try {
    return parseModelsFile(await readFile(path, "utf8"));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return emptyModelsFile();
    throw error;
  }
}

function pick<T extends Record<string, unknown>>(obj: T, allowed: Set<string>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out as T;
}

export function sanitizeModel(model: ModelRecord): ModelRecord {
  const clean = pick(model as Record<string, unknown>, MODEL_KEYS) as ModelRecord;
  if (!clean.id) throw new Error("model.id is required");
  return clean;
}

export function sanitizeProvider(provider: ProviderRecord): ProviderRecord {
  const clean = pick(provider as Record<string, unknown>, PROVIDER_KEYS) as ProviderRecord;
  if (clean.models) clean.models = clean.models.map(sanitizeModel);
  return clean;
}

export function sanitizeFile(file: ModelsFile): ModelsFile {
  const providers: Record<string, ProviderRecord> = {};
  for (const [id, provider] of Object.entries(file.providers)) {
    providers[id] = sanitizeProvider(provider);
  }
  return { providers };
}

export function draftToRecord(draft: ModelDraft): ModelRecord {
  const rec: ModelRecord = {
    id: draft.id,
    name: draft.name,
    api: draft.api,
    baseUrl: draft.baseUrl,
    reasoning: draft.reasoning,
    input: draft.input,
    contextWindow: draft.contextWindow,
    maxTokens: draft.maxTokens,
  };
  if (draft.thinkingLevelMap) rec.thinkingLevelMap = draft.thinkingLevelMap;
  if (draft.headers) rec.headers = draft.headers;
  if (draft.samplingParams) rec.samplingParams = draft.samplingParams;
  if (draft.compat && Object.keys(draft.compat).length) rec.compat = draft.compat;
  return rec;
}

export function listExistingProviders(file: ModelsFile): string[] {
  return Object.keys(file.providers);
}

export function groupModelsByEndpoint(provider: ProviderRecord): Map<string, ModelRecord[]> {
  const map = new Map<string, ModelRecord[]>();
  for (const model of provider.models ?? []) {
    const api = model.api ?? provider.api ?? "?";
    const base = model.baseUrl ?? provider.baseUrl ?? "?";
    const key = `${api} ${canonicalizeUrl(base)}`;
    const list = map.get(key) ?? [];
    list.push(model);
    map.set(key, list);
  }
  return map;
}

export function findModelConflict(
  provider: ProviderRecord,
  id: string,
): { api?: string; baseUrl?: string } | undefined {
  const hit = (provider.models ?? []).find((m) => m.id === id);
  if (!hit) return undefined;
  return { api: hit.api ?? provider.api, baseUrl: hit.baseUrl ?? provider.baseUrl };
}

/**
 * Move thinkingFormat / requiresReasoningContentOnAssistantMessages from
 * provider-level compat onto existing models that lack them, then delete
 * those keys from the provider. Required before adding a non-openai API.
 */
export function sinkThinkingCompat(provider: ProviderRecord): ProviderRecord {
  const next: ProviderRecord = {
    ...provider,
    compat: provider.compat ? { ...provider.compat } : undefined,
    models: (provider.models ?? []).map((m) => ({
      ...m,
      compat: m.compat ? { ...m.compat } : undefined,
    })),
  };
  const pcompat = next.compat ?? {};
  const hasSink = THINKING_SINK_KEYS.some((k) => pcompat[k] != null);
  if (!hasSink) return next;

  for (const model of next.models ?? []) {
    const api = model.api ?? next.api ?? "";
    if (!isOpenAiApi(api) && api) continue;
    model.compat = model.compat ?? {};
    for (const key of THINKING_SINK_KEYS) {
      if (model.compat[key] == null && pcompat[key] != null) {
        model.compat[key] = pcompat[key];
      }
    }
  }
  if (next.compat) {
    for (const key of THINKING_SINK_KEYS) delete next.compat[key];
    if (Object.keys(next.compat).length === 0) delete next.compat;
  }
  return next;
}

export function needsThinkingSink(provider: ProviderRecord, incomingApis: string[]): boolean {
  const addingNative = incomingApis.some((api) => !isOpenAiApi(api));
  if (!addingNative) return false;
  return THINKING_SINK_KEYS.some((k) => provider.compat?.[k] != null);
}

export function mergeProviderLevelDefaults(provider: ProviderRecord): ProviderRecord {
  const next: ProviderRecord = {
    ...provider,
    compat: { ...PROVIDER_COMPAT, ...provider.compat },
    headers: provider.headers ? { ...provider.headers } : undefined,
  };
  return next;
}

export type MergeMode = "merge" | "replace-endpoint";

export interface MergeOptions {
  providerId: string;
  name?: string;
  apiKey?: string;
  drafts: ModelDraft[];
  mode: MergeMode;
  /** When replace-endpoint, drop models matching these endpoints first. */
  replace?: Array<{ api: string; baseUrl: string }>;
}

export interface MergeResult {
  file: ModelsFile;
  added: number;
  replaced: number;
  skippedConflicts: string[];
  sunkThinking: boolean;
}

export function applyDrafts(file: ModelsFile, opts: MergeOptions): MergeResult {
  const existing = file.providers[opts.providerId] ?? { name: opts.name ?? opts.providerId, models: [] };
  let provider: ProviderRecord = {
    ...existing,
    name: opts.name ?? existing.name ?? opts.providerId,
    models: [...(existing.models ?? [])],
  };
  if (opts.apiKey) provider.apiKey = opts.apiKey;

  const incomingApis = [...new Set(opts.drafts.map((d) => d.api))];
  const sunkThinking = needsThinkingSink(provider, incomingApis);
  if (sunkThinking) provider = sinkThinkingCompat(provider);
  provider = mergeProviderLevelDefaults(provider);

  let models = [...(provider.models ?? [])];
  let replaced = 0;

  if (opts.mode === "replace-endpoint") {
    const targets = opts.replace ?? opts.drafts.map((d) => ({ api: d.api, baseUrl: d.baseUrl }));
    const before = models.length;
    models = models.filter((m) => {
      const loc = { api: m.api ?? provider.api, baseUrl: m.baseUrl ?? provider.baseUrl };
      return !targets.some((t) => sameEndpoint(loc, t));
    });
    replaced = before - models.length;
  }

  const skippedConflicts: string[] = [];
  const incomingIds = new Set<string>();
  let added = 0;
  for (const draft of opts.drafts) {
    if (incomingIds.has(draft.id)) {
      skippedConflicts.push(draft.id);
      continue;
    }
    incomingIds.add(draft.id);
    const idx = models.findIndex((m) => m.id === draft.id);
    const rec = draftToRecord(draft);
    if (idx >= 0) {
      const prev = models[idx];
      if (draft.replaceExisting) {
        models[idx] = { ...rec, cost: prev.cost };
      } else {
        skippedConflicts.push(draft.id);
      }
    } else {
      models.push(rec);
      added++;
    }
  }

  // Backfill inherited api/baseUrl onto every model before we drop provider defaults.
  for (const model of models) {
    if (!model.api && provider.api) model.api = provider.api;
    if (!model.baseUrl && provider.baseUrl) model.baseUrl = provider.baseUrl;
  }

  const apis = new Set(models.map((m) => m.api).filter(Boolean));
  const bases = new Set(models.map((m) => m.baseUrl).filter(Boolean));
  if (apis.size > 1) delete provider.api;
  else if (apis.size === 1) provider.api = [...apis][0];
  if (bases.size > 1) delete provider.baseUrl;
  else if (bases.size === 1) provider.baseUrl = [...bases][0];

  provider.models = models;
  const next: ModelsFile = {
    providers: {
      ...file.providers,
      [opts.providerId]: sanitizeProvider(provider),
    },
  };
  return {
    file: sanitizeFile(next),
    added,
    replaced,
    skippedConflicts,
    sunkThinking,
  };
}

export async function rotateBackups(dir: string, keep = KEEP_BACKUPS): Promise<void> {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((n) => n.startsWith("models.json.bak-"));
  } catch {
    return;
  }
  names.sort();
  const extra = names.slice(0, Math.max(0, names.length - keep));
  for (const name of extra) {
    try {
      await unlink(join(dir, name));
    } catch {
      /* ignore */
    }
  }
}

export async function writeModelsFile(file: ModelsFile, path = getModelsJsonPath()): Promise<{ backupPath?: string }> {
  const clean = sanitizeFile(file);
  const json = `${JSON.stringify(clean, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  const release = await acquireWriteLock(path);
  try {
    let backupPath: string | undefined;
    try {
      const current = await readFile(path);
      backupPath = join(dirname(path), backupName());
      await writeFile(backupPath, current, { mode: FILE_MODE });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw error;
    }

    const tmp = `${path}.tmp-${process.pid}`;
    try {
      await writeFile(tmp, json, { encoding: "utf8", mode: FILE_MODE });
      await rename(tmp, path);
    } catch (error) {
      try { await unlink(tmp); } catch { /* best effort */ }
      throw error;
    }
    await rotateBackups(dirname(path));
    return { backupPath };
  } finally {
    await release();
  }
}

async function acquireWriteLock(path: string): Promise<() => Promise<void>> {
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const handle = await open(lockPath, "wx", FILE_MODE);
      await handle.close();
      return async () => { try { await unlink(lockPath); } catch { /* best effort */ } };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) {
          await unlink(lockPath);
          continue;
        }
      } catch (staleError) {
        if ((staleError as NodeJS.ErrnoException).code !== "ENOENT") throw staleError;
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`models.json is locked by another pi-hub process: ${lockPath}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export async function rollbackModelsFile(backupPath?: string, path = getModelsJsonPath()): Promise<void> {
  const release = await acquireWriteLock(path);
  try {
    if (!backupPath) {
      try { await unlink(path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return;
    }
    const body = await readFile(backupPath);
    const tmp = `${path}.tmp-rollback-${process.pid}`;
    try {
      await writeFile(tmp, body, { mode: FILE_MODE });
      await rename(tmp, path);
    } catch (error) {
      try { await unlink(tmp); } catch { /* best effort */ }
      throw error;
    }
  } finally {
    await release();
  }
}

export function providerNameOk(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name);
}

export const BUILTIN_PROVIDER_IDS = new Set([
  "openai",
  "anthropic",
  "google",
  "google-vertex",
  "azure-openai-responses",
  "amazon-bedrock",
  "deepseek",
  "xai",
  "openrouter",
  "groq",
  "mistral",
  "minimax",
  "minimax-cn",
  "kimi-coding",
  "zai",
  "zai-coding-cn",
  "opencode",
  "opencode-go",
  "huggingface",
  "fireworks",
  "together",
  "baseten",
  "nvidia",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "vercel-ai-gateway",
  "github-copilot",
  "radius",
  "llama.cpp",
]);

export function clashesBuiltin(id: string): boolean {
  return BUILTIN_PROVIDER_IDS.has(id) || id.startsWith("cc-switch-");
}

export function deleteProvider(file: ModelsFile, providerId: string): ModelsFile {
  const providers = { ...file.providers };
  delete providers[providerId];
  return sanitizeFile({ providers });
}

export function deleteModels(file: ModelsFile, providerId: string, ids: string[]): ModelsFile {
  const provider = file.providers[providerId];
  if (!provider) return file;
  const drop = new Set(ids);
  const next: ProviderRecord = {
    ...provider,
    models: (provider.models ?? []).filter((m) => !drop.has(m.id)),
  };
  return sanitizeFile({
    providers: { ...file.providers, [providerId]: next },
  });
}

export function replaceModelRecords(file: ModelsFile, providerId: string, records: ModelRecord[]): ModelsFile {
  const provider = file.providers[providerId];
  if (!provider) return file;
  const byId = new Map(records.map((m) => [m.id, sanitizeModel(m)]));
  const models = (provider.models ?? []).map((m) => {
    const next = byId.get(m.id);
    if (!next) return m;
    return { ...next, cost: m.cost };
  });
  return sanitizeFile({
    providers: { ...file.providers, [providerId]: { ...provider, models } },
  });
}

export async function writeProviderBackup(file: ModelsFile, providerId: string): Promise<string> {
  const provider = file.providers[providerId];
  if (!provider) throw new Error(`no provider ${providerId}`);
  const path = getProviderBackupPath(providerId);
  const body = `${JSON.stringify({ providers: { [providerId]: sanitizeProvider(provider) } }, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { encoding: "utf8", mode: FILE_MODE });
  await rotateNamedBackups(getProviderBackupDir(), `${providerBackupId(providerId)}-`);
  return path;
}

async function rotateNamedBackups(dir: string, prefix: string, keep = KEEP_BACKUPS): Promise<void> {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((n) => n.startsWith(prefix) && n.endsWith(".json"));
  } catch {
    return;
  }
  names.sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    try {
      await unlink(join(dir, name));
    } catch {
      /* ignore */
    }
  }
}

export { backupName };
