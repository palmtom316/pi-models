export interface BoundedFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  redirect?: RequestRedirect;
}

export interface BoundedFetchResult {
  ok: boolean;
  status: number;
  headers: Headers;
  text: string;
  truncated: boolean;
  timedOut: boolean;
}

function combineSignals(user: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const ctrl = new AbortController();
  let timedOut = false;
  const onUser = () => ctrl.abort();
  if (user) {
    if (user.aborted) ctrl.abort();
    else user.addEventListener("abort", onUser, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      user?.removeEventListener("abort", onUser);
    },
  };
}

async function readLimited(res: Response, maxBytes: number, signal?: AbortSignal): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) {
    const text = await res.text();
    if (text.length * 2 > maxBytes) return { text: text.slice(0, maxBytes), truncated: true };
    return { text, truncated: false };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.slice(0, Math.max(0, maxBytes - (total - value.byteLength))));
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"), truncated: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"), truncated: false };
}

export async function boundedFetch(url: string, opts: BoundedFetchOptions = {}): Promise<BoundedFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const { signal, cleanup, timedOut } = combineSignals(opts.signal, timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      signal,
      redirect: opts.redirect ?? "manual",
    });
    const { text, truncated } = await readLimited(res, maxBytes, signal);
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      text,
      truncated,
      timedOut: false,
    };
  } catch (error) {
    if (timedOut()) {
      return { ok: false, status: 0, headers: new Headers(), text: "", truncated: false, timedOut: true };
    }
    throw error;
  } finally {
    cleanup();
  }
}

export function truncateForNotify(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}
