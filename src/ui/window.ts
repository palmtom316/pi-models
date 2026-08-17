import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { OverlayOptions } from "@earendil-works/pi-tui";

export type ThemeLike = {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

export const PIM_OVERLAY_RATIO = 0.7;
export const PIM_OVERLAY_MIN_WIDTH = 48;
export const PIM_OVERLAY_MIN_HEIGHT = 12;

export const PIM_OVERLAY_OPTIONS: OverlayOptions = {
  width: "70%",
  maxHeight: "70%",
  minWidth: PIM_OVERLAY_MIN_WIDTH,
  anchor: "center",
};

export function targetOverlayHeight(termRows: number): number {
  if (!Number.isFinite(termRows) || termRows <= 0) return PIM_OVERLAY_MIN_HEIGHT;
  return Math.max(PIM_OVERLAY_MIN_HEIGHT, Math.floor(termRows * PIM_OVERLAY_RATIO));
}

export function listTheme(theme: ThemeLike) {
  return {
    selectedPrefix: (t: string) => theme.fg("accent", t),
    selectedText: (t: string) => theme.bg("selectedBg", theme.fg("accent", t)),
    description: (t: string) => theme.fg("muted", t),
    scrollInfo: (t: string) => theme.fg("dim", t),
    noMatch: (t: string) => theme.fg("warning", t),
  };
}

function padVisible(text: string, width: number): string {
  const w = visibleWidth(text);
  if (w >= width) return truncateToWidth(text, width);
  return text + " ".repeat(width - w);
}

function hline(width: number): string {
  return "─".repeat(Math.max(0, width));
}

export function renderPimWindow(opts: {
  theme: ThemeLike;
  termRows: number;
  width: number;
  title: string;
  subtitle?: string;
  body: string[];
  footer: string;
}): string[] {
  const theme = opts.theme;
  const width = Math.max(8, opts.width);
  const inner = Math.max(1, width - 2);
  const total = targetOverlayHeight(opts.termRows);
  const chrome = opts.subtitle ? 5 : 4;
  const bodyH = Math.max(1, total - chrome);

  const body = opts.body.slice(0, bodyH);
  while (body.length < bodyH) body.push("");

  const border = (s: string) => theme.fg("border", s);
  const title = truncateToWidth(opts.title, Math.max(1, inner - 4));
  const titleBlock = `─ ${title} `;
  const titleRest = Math.max(0, width - 1 - visibleWidth(titleBlock) - 1);
  const top = border("┌") + theme.fg("accent", theme.bold(titleBlock)) + border(hline(titleRest) + "┐");

  const side = (content: string) => border("│") + padVisible(content, inner) + border("│");

  const lines = [top];
  if (opts.subtitle) {
    lines.push(side(theme.fg("muted", truncateToWidth(opts.subtitle.replace(/\s+/g, " "), inner))));
  }
  for (const row of body) {
    lines.push(side(row));
  }
  lines.push(border("├" + hline(inner) + "┤"));
  lines.push(side(theme.fg("dim", truncateToWidth(opts.footer, inner))));
  lines.push(border("└" + hline(inner) + "┘"));
  return lines;
}
