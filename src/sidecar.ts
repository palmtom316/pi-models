import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { withFileLock } from "./lock.ts";
import { getSidecarPath } from "./paths.ts";

export interface Sidecar {
  cacheFetchedAt?: string;
  lastProvider?: string;
  lastEndpoints?: Array<{ provider: string; api: string; baseUrl: string }>;
  lang?: string;
}

export async function readSidecar(path = getSidecarPath()): Promise<Sidecar> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Sidecar;
  } catch {
    return {};
  }
}

export async function writeSidecar(data: Sidecar, path = getSidecarPath()): Promise<void> {
  await withFileLock(path, async () => {
    const current = await readSidecar(path);
    const safe: Sidecar = {
      cacheFetchedAt: data.cacheFetchedAt ?? current.cacheFetchedAt,
      lastProvider: data.lastProvider ?? current.lastProvider,
      lastEndpoints: data.lastEndpoints ?? current.lastEndpoints,
      lang: data.lang ?? current.lang,
    };
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    try {
      await writeFile(tmp, `${JSON.stringify(safe, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(tmp, path);
    } catch (error) {
      try { await unlink(tmp); } catch { /* best effort */ }
      throw error;
    }
  });
}
