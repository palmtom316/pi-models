import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runWizard } from "./wizard.ts";

export default function piModels(pi: ExtensionAPI) {
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
