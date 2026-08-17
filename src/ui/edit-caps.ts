import { resetDraftCaps } from "../caps.ts";
import { THINKING_LEVELS, type ModelDraft, type ThinkingLevel, type ThinkingLevelMap } from "../types.ts";
import { multiSelect } from "./multi-select.ts";

export { recordToDraft, resetDraftCaps } from "../caps.ts";

type EditCtx = {
  ui: {
    select: (title: string, options: string[]) => Promise<string | undefined>;
    confirm: (title: string, message: string) => Promise<boolean>;
    input: (title: string, placeholder?: string) => Promise<string | undefined>;
    notify: (message: string, type?: "info" | "warning" | "error") => void;
  };
};

function cloneMap(map?: ThinkingLevelMap): ThinkingLevelMap {
  return { ...(map ?? {}) };
}

function mapSummary(map?: ThinkingLevelMap): string {
  const parts = THINKING_LEVELS.filter((k) => map?.[k] != null).map((k) => `${k}=${map?.[k]}`);
  return parts.length ? parts.join(" ") : "(all hidden)";
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.replace(/[_ ,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function editThinkingMap(ctx: EditCtx, map: ThinkingLevelMap): Promise<ThinkingLevelMap | undefined> {
  const next = cloneMap(map);
  while (true) {
    const choice = await ctx.ui.select(`thinkingLevelMap  ${mapSummary(next)}`, [
      ...THINKING_LEVELS.map((k) => `${k}: ${next[k] == null ? "hidden" : JSON.stringify(next[k])}`),
      "done",
    ]);
    if (!choice || choice === "done") return next;
    const level = choice.split(":")[0] as ThinkingLevel;
    const action = await ctx.ui.select(`${level}`, ["hide (null)", "use level name", "none", "disabled", "enabled", "custom", "back"]);
    if (!action || action === "back") continue;
    if (action.startsWith("hide")) next[level] = null;
    else if (action === "use level name") next[level] = level === "off" ? "none" : level;
    else if (action === "custom") {
      const typed = await ctx.ui.input(`${level} value`, String(next[level] ?? level));
      if (typed != null) next[level] = typed;
    } else next[level] = action;
  }
}

export async function editDraft(ctx: EditCtx, draft: ModelDraft): Promise<ModelDraft | undefined> {
  let current = { ...draft, thinkingLevelMap: cloneMap(draft.thinkingLevelMap), input: [...draft.input] };
  while (true) {
    const matched = current.match.officialId ? ` → ${current.match.officialId}` : "";
    const choice = await ctx.ui.select(
      `${current.id}${matched}\n${current.name}  ${current.contextWindow}/${current.maxTokens}  ${current.reasoning ? "reasoning" : "no-think"}  ${current.input.join("+")}\n${mapSummary(current.thinkingLevelMap)}`,
      [
        `name: ${current.name}`,
        `contextWindow: ${current.contextWindow}`,
        `maxTokens: ${current.maxTokens}`,
        `input: ${current.input.join("+")}`,
        `reasoning: ${current.reasoning ? "yes" : "no"}`,
        `thinkingLevelMap: ${mapSummary(current.thinkingLevelMap)}`,
        "reset to builtin / heuristic",
        "done",
      ],
    );
    if (!choice) return undefined;
    if (choice === "done") return current;
    if (choice.startsWith("reset")) {
      current = resetDraftCaps(current);
      ctx.ui.notify(`Reset ${current.id} from ${current.match.officialId ?? "heuristic"}`, "info");
      continue;
    }
    if (choice.startsWith("name")) {
      const name = await ctx.ui.input("Display name", current.name);
      if (name) current.name = name;
      continue;
    }
    if (choice.startsWith("contextWindow")) {
      const raw = await ctx.ui.input("contextWindow", String(current.contextWindow));
      current.contextWindow = parseIntOr(raw, current.contextWindow);
      continue;
    }
    if (choice.startsWith("maxTokens")) {
      const raw = await ctx.ui.input("maxTokens", String(current.maxTokens));
      current.maxTokens = parseIntOr(raw, current.maxTokens);
      continue;
    }
    if (choice.startsWith("input")) {
      const input = await ctx.ui.select("input", ["text", "text+image"]);
      if (input === "text") current.input = ["text"];
      if (input === "text+image") current.input = ["text", "image"];
      continue;
    }
    if (choice.startsWith("reasoning")) {
      const on = await ctx.ui.select("reasoning", ["yes", "no"]);
      if (on === "yes") current.reasoning = true;
      if (on === "no") current.reasoning = false;
      continue;
    }
    if (choice.startsWith("thinkingLevelMap")) {
      const map = await editThinkingMap(ctx, current.thinkingLevelMap ?? {});
      if (map) current.thinkingLevelMap = map;
    }
  }
}

export async function maybeEditDrafts(ctx: EditCtx, drafts: ModelDraft[]): Promise<ModelDraft[] | undefined> {
  if (drafts.length === 0) return drafts;
  const action = await ctx.ui.select(
    `Edit capabilities for ${drafts.length} model(s)? Defaults already follow builtin / models.dev (aliased ids keep those caps).`,
    ["skip (keep defaults)", "edit all", "pick which to edit", "cancel"],
  );
  if (!action || action === "cancel") return undefined;
  if (action.startsWith("skip")) return drafts;

  const targets = action.startsWith("pick")
    ? await multiSelect(
        ctx as { ui: { custom: Function } },
        "Which models to edit?",
        drafts.map((d) => ({
          value: d.id,
          label: d.id,
          description: d.match.officialId ? `→ ${d.match.officialId}` : d.match.kind,
        })),
      )
    : drafts.map((d) => d.id);
  if (!targets) return undefined;

  const out = [...drafts];
  for (let i = 0; i < out.length; i++) {
    if (!targets.includes(out[i]!.id)) continue;
    const edited = await editDraft(ctx, out[i]!);
    if (!edited) return undefined;
    out[i] = edited;
  }
  return out;
}

