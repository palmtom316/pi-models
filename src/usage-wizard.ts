import { getSessionsDirPath } from "./paths.ts";
import { t } from "./i18n.ts";
import { collectUsage, type UsageRange, type UsageReport } from "./usage.ts";
import { overlayUsageReport } from "./ui/usage-view.ts";
import type { PimUi } from "./ui/pim-ui.ts";

/** Runtime session dir when the host exposes it (honours --session-dir / settings). */
export function resolveSessionDir(ctx: { sessionManager?: { getSessionDir?: () => string } }): string {
  try {
    const dir = ctx.sessionManager?.getSessionDir?.();
    if (dir && dir.trim()) return dir.trim();
  } catch {
    /* fall through to the default location */
  }
  return getSessionsDirPath();
}

const RANGE_LABELS: Record<UsageRange, (tr: ReturnType<typeof t>) => string> = {
  all: (tr) => tr.usageRangeAll,
  "7d": (tr) => tr.usageRange7d,
  "30d": (tr) => tr.usageRange30d,
};

function isRange(value: string | undefined): value is UsageRange {
  return value === "all" || value === "7d" || value === "30d";
}

/**
 * Token usage browser: pick a time range, scan every session file, then drill
 * provider -> model. `r` inside the table rescans without losing the range.
 */
export async function wizardTokenUsage(
  ui: PimUi,
  ctx: { sessionManager?: { getSessionDir?: () => string } },
): Promise<void> {
  const tr = t();
  const sessionDir = resolveSessionDir(ctx);

  const pickRange = async (): Promise<UsageRange | undefined> => {
    const choice = await ui.select(
      tr.usageRangeTitle,
      (["all", "7d", "30d"] as UsageRange[]).map((range) => ({ value: range, label: RANGE_LABELS[range](tr) })),
      undefined,
      undefined,
      { filterable: false },
    );
    return choice && isRange(choice) ? choice : undefined;
  };

  // The loader surfaces scan errors itself and resolves to undefined on
  // abort/failure, so a missing report just returns to the main menu.
  const scan = (range: UsageRange) =>
    ui.loader<UsageReport | undefined>(
      tr.usageScanning,
      (signal) => collectUsage({ sessionDir, range, signal }),
      undefined,
    );

  while (true) {
    const range = await pickRange();
    if (!range) return;
    let report = await scan(range);
    while (report) {
      const outcome = await overlayUsageReport(ui, tr.usageTitle, report);
      // "exit" leaves the whole flow; "back" returns to the range picker so
      // the table never strands the user in a submenu they did not ask for.
      if (outcome === "exit") return;
      if (outcome === "back") break;
      report = await scan(range);
    }
  }
}
