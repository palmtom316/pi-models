import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readSidecar, writeSidecar } from "../src/sidecar.ts";

describe("sidecar", () => {
  it("merges partial updates without dropping existing fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-sidecar-"));
    const path = join(dir, "pim-models.json");
    await writeSidecar({
      lastProvider: "ELY",
      lastEndpoints: [{ provider: "ELY", api: "openai-completions", baseUrl: "https://relay.example/v1" }],
    }, path);
    await writeSidecar({ cacheFetchedAt: "2026-08-17T00:00:00.000Z" }, path);

    const stored = await readSidecar(path);
    assert.equal(stored.lastProvider, "ELY");
    assert.equal(stored.cacheFetchedAt, "2026-08-17T00:00:00.000Z");
    assert.equal(stored.lastEndpoints?.length, 1);
  });

  it("keeps both fields when concurrent sidecar writes re-read under the lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pim-sidecar-lock-"));
    const path = join(dir, "pim-models.json");
    await Promise.all([
      writeSidecar({ lastProvider: "A" }, path),
      writeSidecar({ cacheFetchedAt: "2026-08-19T00:00:00.000Z" }, path),
    ]);
    const stored = await readSidecar(path);
    assert.equal(stored.lastProvider, "A");
    assert.equal(stored.cacheFetchedAt, "2026-08-19T00:00:00.000Z");
    await assert.rejects(access(`${path}.lock`));
  });
});
