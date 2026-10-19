import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeUrl,
  catalogCandidates,
  isLocalOrPrivateHost,
  suggestV1,
  stripUserinfoAndFrag,
} from "../src/url.ts";

describe("url", () => {
  it("rejects userinfo", () => {
    assert.throws(() => stripUserinfoAndFrag("https://user:pass@host/v1"), /credentials/);
  });

  it("rejects non-HTTPS remote URLs and non-network schemes", () => {
    assert.throws(() => canonicalizeUrl("http://example.com/v1"), /insecure/);
    assert.throws(() => canonicalizeUrl("http://8.8.8.8/v1"), /insecure/);
    assert.throws(() => canonicalizeUrl("http://172.32.0.1/v1"), /insecure/);
    assert.throws(() => canonicalizeUrl("file:///tmp/models"), /http or https/);
    assert.equal(canonicalizeUrl("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1");
  });

  it("allows plain http for loopback and private/LAN hosts", () => {
    assert.equal(canonicalizeUrl("http://192.168.72.168:3425/v1"), "http://192.168.72.168:3425/v1");
    assert.equal(canonicalizeUrl("http://10.0.0.5:8080/v1"), "http://10.0.0.5:8080/v1");
    assert.equal(canonicalizeUrl("http://172.16.3.9/v1"), "http://172.16.3.9/v1");
    assert.equal(canonicalizeUrl("http://172.31.255.254/v1"), "http://172.31.255.254/v1");
    assert.equal(canonicalizeUrl("http://169.254.1.1/v1"), "http://169.254.1.1/v1");
    assert.equal(canonicalizeUrl("http://100.101.102.103:3425/v1"), "http://100.101.102.103:3425/v1");
    assert.equal(canonicalizeUrl("http://localhost:11434/v1"), "http://localhost:11434/v1");
    assert.equal(canonicalizeUrl("http://gateway.local/v1"), "http://gateway.local/v1");
    assert.equal(canonicalizeUrl("http://nas.lan/v1"), "http://nas.lan/v1");
    assert.equal(canonicalizeUrl("http://[fd12:3456::1]:3425/v1"), "http://[fd12:3456::1]:3425/v1");
    assert.equal(canonicalizeUrl("http://[fe80::1]:3425/v1"), "http://[fe80::1]:3425/v1");
  });

  it("classifies hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.9.9",
      "192.168.1.1",
      "169.254.9.9",
      "100.64.0.1",
      "100.127.255.255",
      "box.local",
      "box.lan",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
    ]) {
      assert.equal(isLocalOrPrivateHost(host), true, host);
    }
    for (const host of [
      "",
      "example.com",
      "api.example.com",
      "8.8.8.8",
      "172.15.0.1",
      "172.32.0.1",
      "192.169.0.1",
      "100.63.0.1",
      "100.128.0.1",
      "256.1.1.1",
      "1.2.3",
      "2001:db8::1",
      "fec0::1",
    ]) {
      assert.equal(isLocalOrPrivateHost(host), false, host);
    }
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
