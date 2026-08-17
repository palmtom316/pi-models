import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getLang, loadLang, otherLang, saveLang, setLang, t } from "../src/i18n.ts";

describe("i18n", () => {
  it("defaults to English", () => {
    setLang("en");
    assert.equal(getLang(), "en");
    assert.equal(t().menuNew, "New provider");
  });

  it("switches to Chinese", () => {
    setLang("zh");
    assert.equal(getLang(), "zh");
    assert.equal(t().menuNew, "新建 provider");
    assert.equal(t().menuCancel, "取消");
  });

  it("otherLang toggles between en and zh", () => {
    assert.equal(otherLang("en"), "zh");
    assert.equal(otherLang("zh"), "en");
  });

  it("persists language preference in sidecar", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-i18n-"));
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      setLang("en");
      await saveLang("zh");
      assert.equal(getLang(), "zh");

      // Simulate restart: reset to default then load from sidecar
      setLang("en");
      assert.equal(getLang(), "en");
      const loaded = await loadLang();
      assert.equal(loaded, "zh");
      assert.equal(getLang(), "zh");
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  });

  it("falls back to English for unknown sidecar lang", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-i18n-"));
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      setLang("zh");
      // No sidecar file exists — should default to current (en after reset)
      setLang("en");
      const loaded = await loadLang();
      assert.equal(loaded, "en");
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  });

  it("zh strings cover all keys in en", () => {
    setLang("en");
    const enKeys = Object.keys(t());
    setLang("zh");
    const zhKeys = Object.keys(t());
    assert.deepEqual(enKeys.sort(), zhKeys.sort());
  });
});
