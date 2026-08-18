import type { OverlayCtx } from "./overlay.ts";
import { overlayLoader } from "./overlay.ts";
import { overlayConfirm, overlayInput, overlayMultiSelect, overlaySelect, type MultiSelectItem } from "./dialogs.ts";

export type PimUi = OverlayCtx & {
  select: (title: string, options: string[], subtitle?: string, footer?: string) => Promise<string | undefined>;
  confirm: (title: string, message: string) => Promise<boolean | undefined>;
  input: (title: string, placeholder?: string) => Promise<string | undefined>;
  secret: (title: string) => Promise<string | undefined>;
  multiSelect: (title: string, items: MultiSelectItem[]) => Promise<string[] | undefined>;
  loader: <T>(title: string, work: (signal: AbortSignal) => Promise<T>, fallback: T) => Promise<T>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
};

export function createPimUi(ctx: OverlayCtx): PimUi {
  return {
    ...ctx,
    select: (title, options, subtitle, footer) => overlaySelect(ctx, title, options, subtitle, footer),
    confirm: (title, message) => overlayConfirm(ctx, title, message),
    input: (title, placeholder) => overlayInput(ctx, title, placeholder),
    secret: (title) => overlayInput(ctx, title, undefined, { secret: true }),
    multiSelect: (title, items) => overlayMultiSelect(ctx, title, items),
    loader: (title, work, fallback) => overlayLoader(ctx, title, work, fallback),
    notify: (message, type) => ctx.ui.notify(message, type),
  };
}

export type { MultiSelectItem };
