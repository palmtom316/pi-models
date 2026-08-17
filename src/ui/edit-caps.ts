import { resetDraftCaps } from "../caps.ts";
import { THINKING_LEVELS, type ModelDraft, type ThinkingLevel, type ThinkingLevelMap } from "../types.ts";
import type { HubUi } from "./hub-ui.ts";

export { recordToDraft, resetDraftCaps } from "../caps.ts";

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

async function editThinkingMap(ui: HubUi, map: ThinkingLevelMap): Promise<ThinkingLevelMap | undefined> {
  const next = cloneMap(map);
  while (true) {
    const choice = await ui.select(`thinkingLevelMap  ${mapSummary(next)}`, [
      ...THINKING_LEVELS.map((k) => `${k}: ${next[k] == null ? "hidden" : JSON.stringify(next[k])}`),
      "done",
    ]);
    if (!choice || choice === "done") return next;
    const level = choice.split(":")[0] as ThinkingLevel;
    const action = await ui.select(`${level}`, ["hide (null)", "use level name", "none", "disabled", "enabled", "custom", "back"]);
    if (!action || action === "back") continue;
    if (action.startsWith("hide")) next[level] = null;
    else if (action === "use level name") next[level] = level === "off" ? "none" : level;
    else if (action === "custom") {
      const typed = await ui.input(`${level} value`, String(next[level] ?? level));
      if (typed != null) next[level] = typed;
    } else next[level] = action;
  }
}

export async function editDraft(ui: HubUi, draft: ModelDraft): Promise<ModelDraft | undefined> {
  let current = { ...draft, thinkingLevelMap: cloneMap(draft.thinkingLevelMap), input: [...draft.input] };
  while (true) {
    const matched = current.match.officialId ? ` → ${current.match.officialId}` : "";
    const choice = await ui.select(
      `${current.id}${matched}`,
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
      `${current.name}  ${current.contextWindow}/${current.maxTokens}  ${current.reasoning ? "reasoning" : "no-think"}  ${current.input.join("+")}\n${mapSummary(current.thinkingLevelMap)}`,
    );
    if (!choice) return undefined;
    if (choice === "done") return current;
    if (choice.startsWith("reset")) {
      current = resetDraftCaps(current);
      ui.notify(`Reset ${current.id} from ${current.match.officialId ?? "heuristic"}`, "info");
      continue;
    }
    if (choice.startsWith("name")) {
      const name = await ui.input("Display name", current.name);
      if (name) current.name = name;
      continue;
    }
    if (choice.startsWith("contextWindow")) {
      const raw = await ui.input("contextWindow", String(current.contextWindow));
      current.contextWindow = parseIntOr(raw, current.contextWindow);
      continue;
    }
    if (choice.startsWith("maxTokens")) {
      const raw = await ui.input("maxTokens", String(current.maxTokens));
      current.maxTokens = parseIntOr(raw, current.maxTokens);
      continue;
    }
    if (choice.startsWith("input")) {
      const input = await ui.select("input", ["text", "text+image"]);
      if (input === "text") current.input = ["text"];
      if (input === "text+image") current.input = ["text", "image"];
      continue;
    }
    if (choice.startsWith("reasoning")) {
      const on = await ui.select("reasoning", ["yes", "no"]);
      if (on === "yes") current.reasoning = true;
      if (on === "no") current.reasoning = false;
      continue;
    }
    if (choice.startsWith("thinkingLevelMap")) {
      const map = await editThinkingMap(ui, current.thinkingLevelMap ?? {});
      if (map) current.thinkingLevelMap = map;
    }
  }
}

export async function maybeEditDrafts(ui: HubUi, drafts: ModelDraft[]): Promise<ModelDraft[] | undefined> {
  if (drafts.length === 0) return drafts;
  const action = await ui.select(
    `Edit capabilities for ${drafts.length} model(s)?`,
    ["skip (keep defaults)", "edit all", "pick which to edit", "cancel"],
    "Defaults already follow builtin / models.dev. Aliased relay ids keep those caps.",
  );
  if (!action || action === "cancel") return undefined;
  if (action.startsWith("skip")) return drafts;

  const targets = action.startsWith("pick")
    ? await ui.multiSelect(
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
    const edited = await editDraft(ui, out[i]!);
    if (!edited) return undefined;
    out[i] = edited;
  }
  return out;
}
