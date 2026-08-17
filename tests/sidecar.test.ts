import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readSidecar, writeSidecar } from "../src/sidecar.ts";

describe("sidecar", () => {
  it("merges partial updates without dropping existing fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-hub-sidecar-"));
    const path = join(dir, "hub-models.json");
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
});
