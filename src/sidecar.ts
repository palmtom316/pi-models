import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getSidecarPath } from "./paths.ts";

export interface Sidecar {
  cacheFetchedAt?: string;
  lastProvider?: string;
  lastEndpoints?: Array<{ provider: string; api: string; baseUrl: string }>;
}

export async function readSidecar(path = getSidecarPath()): Promise<Sidecar> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Sidecar;
  } catch {
    return {};
  }
}

export async function writeSidecar(data: Sidecar, path = getSidecarPath()): Promise<void> {
  const safe: Sidecar = {
    cacheFetchedAt: data.cacheFetchedAt,
    lastProvider: data.lastProvider,
    lastEndpoints: data.lastEndpoints,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
