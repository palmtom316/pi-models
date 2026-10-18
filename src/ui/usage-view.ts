import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { t } from "../i18n.ts";
import { formatTokens, type UsageGroup, type UsageReport } from "../usage.ts";
import { pimCustom, termRows, type OverlayCtx } from "./overlay.ts";
import { renderPimWindow, targetOverlayHeight, type ThemeLike } from "./window.ts";

/** Numeric columns of the usage table, in display order. */
export const USAGE_SORTS = ["total", "input", "output", "cacheRead", "messages"] as const;
export type UsageSort = (typeof USAGE_SORTS)[number];

export type UsageLevel = "providers" | "models";

export interface UsageViewState {
  level: UsageLevel;
  /** Provider being drilled into; only meaningful when `level === "models"`. */
  provider?: string;
  sort: UsageSort;
  cursor: number;
  offset: number;
}

export function createUsageState(): UsageViewState {
  return { level: "providers", sort: "total", cursor: 0, offset: 0 };
}

export function sortValue(group: UsageGroup, sort: UsageSort): number {
  if (sort === "input") return group.input;
  if (sort === "output") return group.output;
  if (sort === "cacheRead") return group.cacheRead;
  if (sort === "messages") return group.messages;
  return group.total;
}

/** Rows currently visible at the state's level, sorted by the active column. */
export function visibleGroups(report: UsageReport, state: UsageViewState): UsageGroup[] {
  const source = state.level === "models"
    ? report.groups.filter((group) => group.provider === state.provider)
    : report.providers;
  return [...source].sort((a, b) => sortValue(b, state.sort) - sortValue(a, state.sort) || a.key.localeCompare(b.key));
}

export function clampState(state: UsageViewState, rows: number): void {
  if (rows <= 0) {
    state.cursor = 0;
    state.offset = 0;
    return;
  }
  if (state.cursor > rows - 1) state.cursor = rows - 1;
  if (state.cursor < 0) state.cursor = 0;
}

function syncOffset(state: UsageViewState, maxVisible: number): void {
  if (maxVisible <= 0) return;
  if (state.cursor < state.offset) state.offset = state.cursor;
  if (state.cursor >= state.offset + maxVisible) state.offset = state.cursor - maxVisible + 1;
  if (state.offset < 0) state.offset = 0;
}

type Column = { key: UsageSort | "name"; width: number };

const NAME_MIN_WIDTH = 12;

/** Pick the columns that still fit; narrow terminals drop the least useful ones. */
export function usageColumns(inner: number): Column[] {
  const wanted: { key: Column["key"]; width: number }[] = [
    { key: "total", width: 8 },
    { key: "input", width: 8 },
    { key: "output", width: 7 },
    { key: "cacheRead", width: 8 },
    { key: "messages", width: 6 },
  ];
  const columns = [...wanted];
  while (columns.length > 0 && inner - columns.reduce((sum, c) => sum + c.width + 1, 0) < NAME_MIN_WIDTH) {
    columns.pop();
  }
  const fixed = columns.reduce((sum, c) => sum + c.width + 1, 0);
  return [{ key: "name", width: Math.max(NAME_MIN_WIDTH, inner - fixed) }, ...columns];
}

/** Column keys hidden because the terminal is too narrow (empty when all fit). */
export function usageDroppedColumns(inner: number): UsageSort[] {
  const kept = new Set(usageColumns(inner).map((column) => column.key));
  return USAGE_SORTS.filter((sort) => !kept.has(sort));
}

function padLeft(text: string, width: number): string {
  const cut = truncateToWidth(text, width);
  const pad = Math.max(0, width - cut.length);
  return " ".repeat(pad) + cut;
}

function rowCells(group: UsageGroup, state: UsageViewState): Record<string, string> {
  const name = state.level === "models" ? (group.model || group.key) : group.provider;
  return {
    name,
    total: formatTokens(group.total),
    input: formatTokens(group.input),
    output: formatTokens(group.output),
    cacheRead: formatTokens(group.cacheRead),
    messages: String(group.messages),
  };
}

function headerCells(state: UsageViewState, tr: ReturnType<typeof t>): Record<string, string> {
  return {
    name: state.level === "models" ? tr.usageHeaderModel : tr.usageHeaderProvider,
    total: tr.usageHeaderTotal,
    input: tr.usageHeaderInput,
    output: tr.usageHeaderOutput,
    cacheRead: tr.usageHeaderCache,
    messages: tr.usageHeaderMessages,
  };
}

function paintRow(
  cells: Record<string, string>,
  columns: Column[],
  sort: UsageSort,
  paint: (text: string) => string,
): string {
  const parts: string[] = [];
  for (const column of columns) {
    const value = cells[column.key] ?? "";
    if (column.key === "name") {
      parts.push(truncateToWidth(value, column.width).padEnd(column.width));
      continue;
    }
    const text = padLeft(value, column.width);
    parts.push(column.key === sort ? paint(text) : text);
  }
  return parts.join(" ");
}

/** Mark the active sort column in the header so it is not colour-only. */
function headerWithSort(
  cells: Record<string, string>,
  columns: Column[],
  sort: UsageSort,
): Record<string, string> {
  const marked: Record<string, string> = { ...cells };
  const active = columns.find((column) => column.key === sort);
  if (active) marked[sort] = `${cells[sort] ?? ""}▼`;
  return marked;
}

/** `bodyLines` is the number of lines `renderPimWindow` will actually show. */
export function renderUsageBody(
  report: UsageReport,
  state: UsageViewState,
  inner: number,
  bodyLines: number,
  theme: ThemeLike,
): string[] {
  const tr = t();
  // Every row is prefixed with "  "/"> " so the columns must fit in `inner - 2`.
  const columns = usageColumns(Math.max(NAME_MIN_WIDTH, inner - 2));
  const dropped = usageDroppedColumns(Math.max(NAME_MIN_WIDTH, inner - 2));
  const body: string[] = [];

  const summary = tr.usageSummary(
    formatTokens(report.totals.total),
    formatTokens(report.totals.input),
    formatTokens(report.totals.output),
    formatTokens(report.totals.cacheRead),
    report.totals.messages,
    report.sessionFiles,
  );
  // Narrow terminals get the short form so the headline number survives.
  const headline = inner >= summary.length
    ? summary
    : tr.usageSummaryShort(formatTokens(report.totals.total), report.totals.messages);
  body.push(theme.fg("muted", truncateToWidth(headline, inner)));
  body.push(
    theme.fg(
      "dim",
      `  ${paintRow(headerWithSort(headerCells(state, tr), columns, state.sort), columns, state.sort, (text) => text)}`,
    ),
  );
  if (dropped.length > 0) {
    body.push(theme.fg("warning", truncateToWidth(`  ${tr.usageHiddenColumns(dropped)}`, inner)));
  }

  const list = visibleGroups(report, state);
  clampState(state, list.length);
  // summary + column header (+ hidden-columns hint) + scroll hint
  const listHeight = Math.max(1, bodyLines - 3 - (dropped.length > 0 ? 1 : 0));
  syncOffset(state, listHeight);
  const slice = list.slice(state.offset, state.offset + listHeight);

  if (slice.length === 0) {
    body.push(theme.fg("warning", truncateToWidth(tr.usageEmpty, inner)));
    return body;
  }

  for (let i = 0; i < slice.length; i++) {
    const group = slice[i]!;
    const absolute = state.offset + i;
    const focused = absolute === state.cursor;
    const cells = rowCells(group, state);
    const line = paintRow(cells, columns, state.sort, (text) => theme.fg("accent", theme.bold(text)));
    const prefix = focused ? "> " : "  ";
    const text = truncateToWidth(`${prefix}${line}`, inner);
    body.push(focused ? theme.bg("selectedBg", theme.fg("accent", text)) : text);
  }
  if (list.length > listHeight) {
    const from = state.offset + 1;
    const to = Math.min(state.offset + listHeight, list.length);
    body.push(theme.fg("dim", `${from}-${to} / ${list.length}`));
  }
  return body;
}

export type UsageOutcome = "refresh" | "exit" | "back";

export function cycleSort(state: UsageViewState, delta: number): void {
  const index = USAGE_SORTS.indexOf(state.sort);
  const next = (index + delta + USAGE_SORTS.length) % USAGE_SORTS.length;
  state.sort = USAGE_SORTS[next]!;
  // Re-sorting keeps the cursor where it is; the list is clamped on render.
}

/** Interactive token-usage table: scroll, re-sort, drill into a provider, rescan. */
export async function overlayUsageReport(
  ctx: OverlayCtx,
  title: string,
  report: UsageReport,
  state: UsageViewState = createUsageState(),
): Promise<UsageOutcome> {
  return pimCustom<UsageOutcome>(ctx, (tui, theme, _kb, done) => {
    const tr = t();
    return {
      render: (width: number) => {
        const rows = termRows(tui);
        const inner = Math.max(1, width - 2);
        const subtitle = state.level === "models" ? tr.usageLevelModels(state.provider ?? "") : undefined;
        // Mirrors renderPimWindow's own chrome math so nothing gets clipped.
        const bodyLines = Math.max(1, targetOverlayHeight(rows) - (subtitle ? 5 : 4));
        const body = renderUsageBody(report, state, inner, bodyLines, theme);
        const footer = state.level === "models" ? tr.usageFooterModels : tr.usageFooterProviders;
        return renderPimWindow({ theme, termRows: rows, width, title, subtitle, body, footer });
      },
      handleInput: (data: string) => {
        const list = visibleGroups(report, state);
        if (matchesKey(data, Key.escape)) {
          if (state.level === "models") {
            state.level = "providers";
            state.provider = undefined;
            state.cursor = 0;
            state.offset = 0;
          } else {
            // Back to the range picker; only an explicit exit leaves the flow.
            done("back");
            return;
          }
        } else if (matchesKey(data, Key.up)) {
          state.cursor = Math.max(0, state.cursor - 1);
        } else if (matchesKey(data, Key.down)) {
          state.cursor = Math.min(Math.max(0, list.length - 1), state.cursor + 1);
        } else if (matchesKey(data, Key.pageUp)) {
          state.cursor = Math.max(0, state.cursor - 10);
        } else if (matchesKey(data, Key.pageDown)) {
          state.cursor = Math.min(Math.max(0, list.length - 1), state.cursor + 10);
        } else if (matchesKey(data, Key.left)) {
          cycleSort(state, -1);
        } else if (matchesKey(data, Key.right)) {
          cycleSort(state, 1);
        } else if (matchesKey(data, Key.enter)) {
          const group = list[state.cursor];
          if (group && state.level === "providers") {
            state.level = "models";
            state.provider = group.provider;
            state.cursor = 0;
            state.offset = 0;
          }
        } else if (matchesKey(data, "r")) {
          done("refresh");
          return;
        }
        tui.requestRender();
      },
      invalidate() {},
    };
  });
}
