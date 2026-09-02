import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { withFileLock } from "./lock.ts";
import { stripJsonc } from "./models-json.ts";
import { getSettingsJsonPath } from "./paths.ts";

const FILE_MODE = 0o600;

export interface DefaultModelRef {
  provider: string;
  model: string;
}

export function readDefaultModelRef(settings: Record<string, unknown>): DefaultModelRef | undefined {
  const provider = settings.defaultProvider;
  const model = settings.defaultModel;
  if (typeof provider === "string" && provider && typeof model === "string" && model) {
    return { provider, model };
  }
  return undefined;
}

export function setDefaultModelFields(
  settings: Record<string, unknown>,
  provider: string,
  model: string,
): Record<string, unknown> {
  return { ...settings, defaultProvider: provider, defaultModel: model };
}

export async function readSettingsFile(path = getSettingsJsonPath()): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(stripJsonc(await readFile(path, "utf8"))) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("settings.json must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return {};
    throw error;
  }
}

async function replaceSettingsFileUnlocked(
  settings: Record<string, unknown>,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: FILE_MODE });
    await rename(tmp, path);
  } catch (error) {
    try { await unlink(tmp); } catch { /* best effort */ }
    throw error;
  }
}

export async function mutateSettingsFile(
  mutate: (current: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>,
  path = getSettingsJsonPath(),
): Promise<Record<string, unknown>> {
  return withFileLock(path, async () => {
    const current = await readSettingsFile(path);
    const next = await mutate(current);
    await replaceSettingsFileUnlocked(next, path);
    return next;
  });
}

export async function writeDefaultModel(
  provider: string,
  model: string,
  path = getSettingsJsonPath(),
): Promise<DefaultModelRef> {
  const next = await mutateSettingsFile(
    (current) => setDefaultModelFields(current, provider, model),
    path,
  );
  return { provider: String(next.defaultProvider), model: String(next.defaultModel) };
}
