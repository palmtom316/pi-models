import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalizeUrl, catalogCandidates, suggestV1, stripUserinfoAndFrag } from "../src/url.ts";

describe("url", () => {
  it("rejects userinfo", () => {
    assert.throws(() => stripUserinfoAndFrag("https://user:pass@host/v1"), /credentials/);
  });

  it("rejects non-HTTPS remote URLs and non-network schemes", () => {
    assert.throws(() => canonicalizeUrl("http://example.com/v1"), /insecure/);
    assert.throws(() => canonicalizeUrl("file:///tmp/models"), /https/);
    assert.equal(canonicalizeUrl("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1");
  });

  it("canonicalizes host and trailing slash", () => {
    assert.equal(canonicalizeUrl("https://ELY.example.com/v1/"), "https://ely.example.com/v1");
  });

  it("strips query and hash", () => {
    assert.equal(canonicalizeUrl("https://x.test/v1?x=1#h"), "https://x.test/v1");
  });

  it("openai catalog is {base}/models", () => {
    assert.deepEqual(catalogCandidates("openai-completions", "https://x.test/v1"), ["https://x.test/v1/models"]);
  });

  it("anthropic tries v1/models then models", () => {
    assert.deepEqual(catalogCandidates("anthropic-messages", "https://x.test"), [
      "https://x.test/v1/models",
      "https://x.test/models",
    ]);
  });

  it("suggests /v1 for openai html homes", () => {
    assert.equal(suggestV1("openai-completions", "https://x.test"), "https://x.test/v1");
    assert.equal(suggestV1("openai-completions", "https://x.test/v1"), undefined);
  });
});
