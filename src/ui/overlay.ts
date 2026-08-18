import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import { PIM_OVERLAY_OPTIONS, renderPimWindow, type ThemeLike } from "./window.ts";

export type OverlayCtx = {
  ui: {
    custom: Function;
    notify: (message: string, type?: "info" | "warning" | "error") => void;
  };
};

export type OverlayTui = {
  requestRender: () => void;
  terminal?: { rows?: number; columns?: number };
};

export function pimCustom<T>(
  ctx: OverlayCtx,
  factory: (tui: OverlayTui, theme: ThemeLike, kb: unknown, done: (value: T) => void) => unknown,
): Promise<T> {
  return ctx.ui.custom(factory, {
    overlay: true,
    overlayOptions: PIM_OVERLAY_OPTIONS,
  });
}

export function termRows(tui: OverlayTui): number {
  return tui.terminal?.rows ?? process.stdout.rows ?? 24;
}

export function wrapInPimWindow(
  tui: OverlayTui,
  theme: ThemeLike,
  title: string,
  body: string[],
  footer: string,
  subtitle?: string,
): (width: number) => string[] {
  return (width: number) =>
    renderPimWindow({
      theme,
      termRows: termRows(tui),
      width,
      title,
      subtitle,
      body,
      footer,
    });
}

export async function overlayLoader<T>(
  ctx: OverlayCtx,
  title: string,
  work: (signal: AbortSignal) => Promise<T>,
  fallback: T,
): Promise<T> {
  return pimCustom(ctx, (tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui as never, theme as never, title);
    loader.onAbort = () => done(fallback);
    work(loader.signal)
      .then(done)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        done(fallback);
        ctx.ui.notify(message, "error");
      });
    return {
      render: (width: number) => {
        const inner = loader.render(Math.max(8, width - 2));
        return renderPimWindow({
          theme,
          termRows: termRows(tui),
          width,
          title,
          body: inner,
          footer: "esc back",
        });
      },
      handleInput: (data: string) => loader.handleInput(data),
      invalidate: () => loader.invalidate(),
      dispose: () => loader.dispose?.(),
    };
  });
}
