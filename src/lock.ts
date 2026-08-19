import { open, stat, unlink } from "node:fs/promises";

const FILE_MODE = 0o600;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_MS = 30_000;

export async function withFileLock<T>(
  path: string,
  fn: () => Promise<T>,
  opts: { timeoutMs?: number; staleMs?: number } = {},
): Promise<T> {
  const lockPath = `${path}.lock`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const handle = await open(lockPath, "wx", FILE_MODE);
      await handle.close();
      try {
        return await fn();
      } finally {
        try { await unlink(lockPath); } catch { /* best effort */ }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > staleMs) {
          await unlink(lockPath);
          continue;
        }
      } catch (staleError) {
        if ((staleError as NodeJS.ErrnoException).code !== "ENOENT") throw staleError;
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`file is locked by another pim process: ${lockPath}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
