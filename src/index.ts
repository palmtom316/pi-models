import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runWizard } from "./wizard.ts";

export default function hubModels(pi: ExtensionAPI) {
  const handler = async (_args: string, ctx: Parameters<typeof runWizard>[0]) => {
    try {
      await runWizard(ctx, pi);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/sk-|api[_-]?key|bearer/i.test(message)) ctx.ui.notify(message, "error");
      else ctx.ui.notify("pi-hub failed", "error");
    }
  };

  pi.registerCommand("pi-hub", {
    description: "Add or manage models.json providers (70% overlay)",
    handler,
  });
  pi.registerCommand("hub-models", {
    description: "Alias for /pi-hub",
    handler,
  });
  pi.registerCommand("add-provider", {
    description: "Alias for /pi-hub",
    handler,
  });
}
