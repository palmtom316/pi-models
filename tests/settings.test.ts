import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  readDefaultModelRef,
  readSettingsFile,
  setDefaultModelFields,
  writeDefaultModel,
} from "../src/settings.ts";

describe("settings.json default model", () => {
  it("reads provider/model only when both strings are present", () => {
    assert.equal(readDefaultModelRef({}), undefined);
    assert.equal(readDefaultModelRef({ defaultProvider: "XJM" }), undefined);
    assert.equal(readDefaultModelRef({ defaultModel: "gpt" }), undefined);
    assert.deepEqual(
      readDefaultModelRef({ defaultProvider: "XJM", defaultModel: "gpt-5.6-sol" }),
      { provider: "XJM", model: "gpt-5.6-sol" },
    );
  });

  it("merges default fields without dropping unrelated settings", () => {
    const next = setDefaultModelFields(
      { theme: "dark", packages: ["@palmtom/pi-models"], defaultThinkingLevel: "high" },
      "ELY",
      "claude-opus-5",
    );
    assert.equal(next.theme, "dark");
    assert.deepEqual(next.packages, ["@palmtom/pi-models"]);
    assert.equal(next.defaultThinkingLevel, "high");
    assert.equal(next.defaultProvider, "ELY");
    assert.equal(next.defaultModel, "claude-opus-5");
  });

  it("creates settings.json and preserves existing fields on write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-settings-"));
    const path = join(dir, "settings.json");
    await writeFile(path, JSON.stringify({
      theme: "dark",
      compaction: { enabled: true },
      defaultProvider: "OLD",
      defaultModel: "old-id",
    }, null, 2));

    await writeDefaultModel("XJM", "gpt-5.6-sol", path);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    assert.equal(stored.theme, "dark");
    assert.deepEqual(stored.compaction, { enabled: true });
    assert.equal(stored.defaultProvider, "XJM");
    assert.equal(stored.defaultModel, "gpt-5.6-sol");
  });

  it("parses JSONC settings and writes standard JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-settings-jsonc-"));
    const path = join(dir, "settings.json");
    await writeFile(path, `{
      // comment
      "theme": "dark",
      "defaultProvider": "OLD",
      "defaultModel": "old-id",
    }\n`);
    await writeDefaultModel("QQ", "GLM-5.2-think", path);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    assert.equal(stored.theme, "dark");
    assert.equal(stored.defaultProvider, "QQ");
    assert.equal(stored.defaultModel, "GLM-5.2-think");
  });

  it("treats a missing file as empty settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-settings-missing-"));
    const path = join(dir, "settings.json");
    assert.deepEqual(await readSettingsFile(path), {});
    await writeDefaultModel("ELY", "kimi-k2", path);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    assert.equal(stored.defaultProvider, "ELY");
    assert.equal(stored.defaultModel, "kimi-k2");
    await assert.rejects(access(`${path}.lock`));
  });

  it("keeps unrelated fields when concurrent writes re-read under the lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-settings-lock-"));
    const path = join(dir, "settings.json");
    await writeFile(path, JSON.stringify({ theme: "dark", packages: ["x"] }));
    const { mutateSettingsFile } = await import("../src/settings.ts");
    await Promise.all([
      writeDefaultModel("A", "one", path),
      mutateSettingsFile((current) => ({ ...current, theme: "light" }), path),
    ]);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    assert.equal(stored.defaultProvider, "A");
    assert.equal(stored.defaultModel, "one");
    assert.equal(stored.theme, "light");
    assert.deepEqual(stored.packages, ["x"]);
    await assert.rejects(access(`${path}.lock`));
  });
});
