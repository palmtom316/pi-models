import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchCatalog } from "../src/catalog.ts";

describe("fetchCatalog authentication", () => {
  it("uses x-goog-api-key for native Google catalogs", async () => {
    const original = globalThis.fetch;
    let sent = new Headers();
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response(JSON.stringify({ models: [{ name: "models/gemini-test" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await fetchCatalog({
        api: "google-generative-ai",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "google-secret",
      });
      assert.equal(result.items[0]?.id, "gemini-test");
      assert.equal(sent.get("x-goog-api-key"), "google-secret");
      assert.equal(sent.has("authorization"), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("redacts an echoed API key from errors", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("bad key literal-secret", { status: 401 })) as typeof fetch;
    try {
      const result = await fetchCatalog({
        api: "openai-completions",
        baseUrl: "https://relay.example/v1",
        apiKey: "literal-secret",
      });
      assert.equal(result.error?.includes("literal-secret"), false);
      assert.equal(result.error?.includes("[redacted]"), true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
