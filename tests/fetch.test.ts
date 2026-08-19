import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { boundedFetch, truncateForNotify } from "../src/fetch.ts";

function listen(server: ReturnType<typeof createServer>): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("expected TCP address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/`,
        close: () => new Promise((done, fail) => server.close((err) => err ? fail(err) : done())),
      });
    });
  });
}

describe("boundedFetch", () => {
  it("reports timeouts instead of throwing AbortError", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("late");
      }, 200);
    });
    const { url, close } = await listen(server);
    try {
      const result = await boundedFetch(url, { timeoutMs: 20 });
      assert.equal(result.timedOut, true);
      assert.equal(result.ok, false);
      assert.equal(result.status, 0);
    } finally {
      await close();
    }
  });

  it("rethrows a user abort instead of treating it as a timeout", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("late");
      }, 200);
    });
    const { url, close } = await listen(server);
    const ctrl = new AbortController();
    queueMicrotask(() => ctrl.abort());
    try {
      await assert.rejects(
        boundedFetch(url, { signal: ctrl.signal, timeoutMs: 5_000 }),
        (error: unknown) => error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message)),
      );
    } finally {
      await close();
    }
  });

  it("truncates oversized bodies", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("abcdefghij");
    });
    const { url, close } = await listen(server);
    try {
      const result = await boundedFetch(url, { maxBytes: 4 });
      assert.equal(result.truncated, true);
      assert.equal(result.ok, true);
      assert.ok(result.text.length <= 4);
    } finally {
      await close();
    }
  });

  it("flattens notify text", () => {
    assert.equal(truncateForNotify("a\n\tb   c", 200), "a b c");
    assert.equal(truncateForNotify("abcdefghij", 4), "abcd\u2026");
  });
});
