import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCatalogBody, parseManualIds } from "../src/catalog.ts";

describe("parseCatalogBody", () => {
  it("parses OpenAI {data:[{id}]}", () => {
    const items = parseCatalogBody(JSON.stringify({ data: [{ id: "gpt-5.6-sol" }, { id: "deepseek-v4-flash-0731" }] }));
    assert.deepEqual(items.map((i) => i.id), ["gpt-5.6-sol", "deepseek-v4-flash-0731"]);
  });

  it("parses {models:['a']}", () => {
    const items = parseCatalogBody(JSON.stringify({ models: ["a", "b"] }));
    assert.deepEqual(items.map((i) => i.id), ["a", "b"]);
  });

  it("strips Gemini models/ prefix", () => {
    const items = parseCatalogBody(JSON.stringify({ models: [{ name: "models/gemini-3.7-flash" }] }));
    assert.equal(items[0]?.id, "gemini-3.7-flash");
  });

  it("uses Anthropic display_name", () => {
    const items = parseCatalogBody(JSON.stringify({ data: [{ id: "claude-opus-5", display_name: "Claude Opus 5" }] }));
    assert.equal(items[0]?.name, "Claude Opus 5");
  });

  it("parses top-level array", () => {
    const items = parseCatalogBody(JSON.stringify([{ id: "x" }, "y"]));
    assert.deepEqual(items.map((i) => i.id), ["x", "y"]);
  });

  it("returns empty on html", () => {
    assert.deepEqual(parseCatalogBody("<html>home</html>"), []);
  });

  it("parses manual ids", () => {
    assert.deepEqual(parseManualIds("a, b\nc"), ["a", "b", "c"]);
  });
});
