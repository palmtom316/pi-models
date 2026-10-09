import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyInputBackfill, describeChanges, persistInputBackfill } from "./caps-backfill.ts";
import { t } from "./i18n.ts";
import { applyVisibility } from "./visibility.ts";
import { runWizard } from "./wizard.ts";

/**
 * Heal `input` lists written by older versions before anything reads them:
 * an id the builtin catalog knows is multimodal but whose entry still says
 * `["text"]` silently loses every image Pi hands to the model.
 *
 * The file is repaired first so the fix survives a restart and other
 * consumers (e.g. `pi --list-models`) agree, then the registry is patched so
 * the running session stops dropping images immediately.
 */
async function healInputCapabilities(ctx: Parameters<typeof runWizard>[0]): Promise<void> {
  try {
    const changes = await persistInputBackfill();
    await applyInputBackfill(ctx.modelRegistry);
    if (changes.length) {
      ctx.ui.notify(t().inputBackfilled(changes.length, describeChanges(changes)), "info");
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(t().inputBackfillFailed(raw), "warning");
  }
}

export default function piModels(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    // Backfill first: applyVisibility wraps whatever provider is composed, so
    // wrapping after it would hide the corrected model list.
    await healInputCapabilities(ctx);
    await applyVisibility(ctx.modelRegistry);
  });

  const handler = async (_args: string, ctx: Parameters<typeof runWizard>[0]) => {
    try {
      await runWizard(ctx, pi);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = raw
        .replace(/authorization\s*[:=]\s*bearer\s+\S+/gi, "Authorization: [redacted]")
        .replace(/(["']?api[_-]?key["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]");
      ctx.ui.notify(message, "error");
    }
  };

  pi.registerCommand("pim", {
    description: "Add or manage models.json providers (70% overlay)",
    handler,
  });
  pi.registerCommand("pim-models", {
    description: "Alias for /pim",
    handler,
  });
  pi.registerCommand("add-provider", {
    description: "Alias for /pim",
    handler,
  });
}
