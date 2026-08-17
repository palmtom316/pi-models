import type { OverlayCtx } from "./overlay.ts";
import { overlayLoader } from "./overlay.ts";
import { overlayConfirm, overlayInput, overlayMultiSelect, overlaySelect, type MultiSelectItem } from "./dialogs.ts";

export type HubUi = OverlayCtx & {
  select: (title: string, options: string[], subtitle?: string) => Promise<string | undefined>;
  confirm: (title: string, message: string) => Promise<boolean>;
  input: (title: string, placeholder?: string) => Promise<string | undefined>;
  secret: (title: string) => Promise<string | undefined>;
  multiSelect: (title: string, items: MultiSelectItem[]) => Promise<string[] | undefined>;
  loader: <T>(title: string, work: (signal: AbortSignal) => Promise<T>, fallback: T) => Promise<T>;
};

export function createHubUi(ctx: OverlayCtx): HubUi {
  return {
    ...ctx,
    select: (title, options, subtitle) => overlaySelect(ctx, title, options, subtitle),
    confirm: (title, message) => overlayConfirm(ctx, title, message),
    input: (title, placeholder) => overlayInput(ctx, title, placeholder),
    secret: (title) => overlayInput(ctx, title, undefined, { secret: true }),
    multiSelect: (title, items) => overlayMultiSelect(ctx, title, items),
    loader: (title, work, fallback) => overlayLoader(ctx, title, work, fallback),
  };
}

export type { MultiSelectItem };
