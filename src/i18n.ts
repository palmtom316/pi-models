import { readSidecar, writeSidecar, type Sidecar } from "./sidecar.ts";

export type Lang = "en" | "zh";

/**
 * All user-visible strings. String members are plain text; function members
 * take runtime arguments and return the final string.
 */
export interface Strings {
  // main menu
  menuTitle: string;
  menuProviders: string;
  menuProvidersDesc: string;
  menuSwitchDefault: string;
  menuSwitchDefaultDesc: string;
  menuNew: string;
  menuNewDesc: string;
  menuAdd: string;
  menuAddDesc: string;
  menuUsage: string;
  menuUsageDesc: string;
  menuSettings: string;
  menuSettingsDesc: string;
  menuExit: string;
  menuExitDesc: string;
  menuStatus: (providers: number, models: number, current?: string) => string;

  // provider hub
  providersTitle: string;
  providersSubtitle: string;
  providersEmpty: string;
  providerStatus: (models: number, api: string, hidden: boolean) => string;
  providerModels: string;
  providerModelsDesc: string;
  providerSetDefault: string;
  providerSetDefaultDesc: string;
  providerAddApi: string;
  providerAddApiDesc: string;
  providerRefresh: string;
  providerRefreshDesc: string;
  providerHide: string;
  providerHideDesc: string;
  providerUnhide: string;
  providerUnhideDesc: string;
  providerBackup: string;
  providerBackupDesc: string;
  providerDeleteModels: string;
  providerDeleteModelsDesc: string;
  providerDeleteProvider: string;
  providerDeleteProviderDesc: string;
  modelsTitle: (name: string) => string;
  modelsSubtitle: string;
  editedModel: (name: string, id: string) => string;

  // settings
  settingsTitle: string;
  settingsLanguage: string;
  settingsLanguageDesc: (current: string) => string;
  settingsCache: string;
  settingsCacheDesc: string;
  settingsBack: string;
  languageTitle: string;
  languageCurrent: string;

  // generic answers
  answerYes: string;
  answerNo: string;
  unknownTime: string;
  sourceHeuristic: string;
  secretHidden: string;
  emptyList: string;

  // footers
  footerSelect: string;
  footerSelectExit: string;
  footerConfirm: string;
  footerInput: string;
  footerSecret: string;
  footerLoader: string;
  footerFilter: (filter: string) => string;

  // provider creation
  stepLabel: (step: number, total: number, what: string) => string;
  stepName: string;
  stepApi: string;
  stepBaseUrl: string;
  stepUserAgent: string;
  stepApiKey: string;
  inputProviderName: string;
  errNameFormat: string;
  builtinName: string;
  builtinNameConfirm: (name: string) => string;
  existsMerge: string;
  existsMergeMsg: (name: string) => string;
  secretApiKey: string;

  // API / endpoint collection
  selectApiType: string;
  apiTypeDescription: (api: string) => string;
  inputBaseUrl: string;
  confirmUserAgent: string;
  confirmUserAgentMsg: string;
  addAnotherApi: string;
  addAnotherApiMsg: (count: number) => string;

  // per-group key loop
  groupTitle: (index: number) => string;
  groupAnotherKey: string;
  groupAnotherKeyMsg: string;
  groupSkipped: (providerId: string) => string;

  // catalog fetch
  fetchingModels: (api: string, baseUrl: string) => string;
  noModelsReturned: string;
  inputManualIds: string;
  catalogFailed: string;
  htmlSuggestV1: (url: string) => string;

  // multi-select
  conflictLabel: string;
  multiSelectAll: string;
  multiSelectInvert: string;
  multiSelectNone: string;
  multiSelectFilter: (filter: string) => string;
  multiSelectFooter: (count: number) => string;
  multiSelectNoMatch: string;
  multiSelectNothing: string;
  multiSelectHidden: (on: boolean) => string;

  // models.dev
  lookingUp: (count: number) => string;
  modelsDevCatalog: (at: string) => string;

  // fuzzy
  confirmFuzzyTitle: string;
  confirmFuzzyMsg: (id: string, bucket: string, officialId: string) => string;

  // id conflict
  idExistsTitle: (id: string) => string;
  idExistsKeep: string;
  idExistsReplace: string;
  idExistsSkip: string;

  // edit caps
  editCapsTitle: (count: number) => string;
  editCapsSkip: string;
  editCapsAll: string;
  editCapsPick: string;
  editCapsCancel: string;
  editCapsSubtitle: string;

  // persist
  nothingToWrite: string;
  errDraftMissingEndpoint: string;
  confirmWriteTitle: string;
  confirmWriteMsg: (count: number, provider: string) => string;
  confirmWriteMode: (mode: string) => string;
  confirmWriteMore: (count: number) => string;
  refreshFailed: (err: string, backup?: string) => string;
  confirmRollback: string;
  confirmRollbackRestore: (path: string) => string;
  confirmRollbackRemove: string;
  rollbackRefreshFailed: (err: string) => string;
  rolledBack: string;
  addedModels: (added: number, replaced: number, provider: string, apis: string, conflicts: number) => string;
  sunkThinkingMsg: string;
  confirmSwitchModel: string;
  confirmSwitchModelMsg: (provider: string, id: string) => string;
  setModelFailed: string;
  setDefaultFailed: string;
  switchedDefault: (provider: string, id: string) => string;
  defaultModelCurrent: (provider: string, id: string) => string;
  defaultModelUnset: string;
  selectDefaultModel: string;
  noModelsAnywhere: string;
  confirmSetDefault: string;
  confirmSetDefaultMsg: (provider: string, id: string) => string;

  // add api
  noProvidersCreateFirst: string;
  selectProvider: string;
  secretApiKeyFor: (name: string) => string;
  applyHowTitle: string;
  applyHowMerge: string;
  applyHowMergeDesc: string;
  applyHowReplace: string;
  applyHowReplaceDesc: string;
  applyHowCancel: string;
  applyHowCancelDesc: string;
  applyHowDiscarded: (count: number) => string;

  // refresh cache
  refreshingCache: string;
  refreshingCacheResult: (count: number, at: string) => string;
  cacheCancelled: string;

  // manage wizards
  noProvidersInFile: string;
  confirmDeleteProvider: string;
  confirmDeleteProviderMsg: (name: string, count: number) => string;
  deletedProvider: (name: string, backup: string) => string;
  deleteModelsTitle: (name: string) => string;
  noModels: (name: string) => string;
  confirmDeleteModels: string;
  confirmDeleteModelsMsg: (count: number, name: string, ids: string[]) => string;
  deletedModels: (count: number, name: string) => string;
  backedUpProvider: (name: string, path: string) => string;
  hideProviderTitle: string;
  hideProviderNone: string;
  confirmHideProvider: string;
  confirmHideProviderMsg: (name: string, count: number) => string;
  hiddenProvider: (name: string) => string;
  unhideProviderTitle: string;
  unhideProviderNone: string;
  unhideStale: (names: string) => string;
  unhiddenProvider: (name: string) => string;
  refreshModelsTitle: string;
  refreshNoEndpoint: (name: string) => string;
  refreshNeedKey: (name: string) => string;
  refreshEndpointTitle: (name: string) => string;
  refreshRemovedTitle: (name: string) => string;
  refreshNothingChanged: string;
  refreshedModels: (added: number, removed: number, name: string) => string;

  // edit caps detail
  editName: (name: string) => string;
  editContextWindow: (n: number) => string;
  editMaxTokens: (n: number) => string;
  editInput: (input: string) => string;
  editReasoning: (on: boolean) => string;
  editThinkingMap: (summary: string) => string;
  editReset: string;
  editDone: string;
  resetFromMsg: (id: string, source: string) => string;
  inputDisplayName: string;
  inputContextWindow: string;
  inputMaxTokens: string;
  selectInput: string;
  inputText: string;
  inputTextImage: string;
  selectReasoning: string;
  reasoningYes: string;
  reasoningNo: string;
  reasoningOn: string;
  reasoningOff: string;
  thinkingHidden: string;
  thinkingMapAllHidden: string;
  thinkingHide: string;
  thinkingUseLevelName: string;
  thinkingNone: string;
  thinkingDisabled: string;
  thinkingEnabled: string;
  thinkingCustom: string;
  thinkingBack: string;
  thinkingCustomValue: (level: string) => string;

  // session self-heal
  inputBackfilled: (count: number, detail: string) => string;
  inputBackfillFailed: (err: string) => string;

  // non-tui
  errInteractiveOnly: string;

  // token usage
  usageTitle: string;
  usageRangeTitle: string;
  usageRangeAll: string;
  usageRange7d: string;
  usageRange30d: string;
  usageScanning: string;
  usageSummary: (total: string, input: string, output: string, cacheRead: string, messages: number, files: number) => string;
  usageSummaryShort: (total: string, messages: number) => string;
  usageHeaderProvider: string;
  usageHeaderModel: string;
  usageHeaderTotal: string;
  usageHeaderInput: string;
  usageHeaderOutput: string;
  usageHeaderCache: string;
  usageHeaderMessages: string;
  usageEmpty: string;
  usageHiddenColumns: (columns: string[]) => string;
  usageLevelModels: (provider: string) => string;
  usageFooterProviders: string;
  usageFooterModels: string;
}

const en: Strings = {
  menuTitle: "pim",
  menuProviders: "Providers & models",
  menuProvidersDesc: "browse, edit, hide, back up, delete",
  menuSwitchDefault: "Switch default model",
  menuSwitchDefaultDesc: "pick the model loaded at startup",
  menuNew: "New provider",
  menuNewDesc: "add a relay endpoint and fetch its models",
  menuAdd: "Add API / models",
  menuAddDesc: "extend a provider you already have",
  menuUsage: "Token usage",
  menuUsageDesc: "tokens by provider and model across sessions",
  menuSettings: "Settings",
  menuSettingsDesc: "language, models.dev cache",
  menuExit: "Exit",
  menuExitDesc: "close /pim",
  menuStatus: (providers, models, current) =>
    `${providers} provider(s) · ${models} model(s) · ${current ? `default ${current}` : "no default model"}`,

  providersTitle: "Providers",
  providersEmpty: "No providers in models.json yet. Use \"New provider\" to add one.",
  providerStatus: (models, api, hidden) =>
    `${models} model(s) · ${api}${hidden ? " · hidden from /model" : ""}`,
  providerModels: "Models & capabilities",
  providerModelsDesc: "list models, edit caps, delete some",
  providerSetDefault: "Set default model",
  providerSetDefaultDesc: "choose a model from this provider",
  providerAddApi: "Add API / models",
  providerAddApiDesc: "new endpoint or key for this provider",
  providerRefresh: "Refresh from catalog",
  providerRefreshDesc: "sync model ids with the provider API",
  providerHide: "Hide from /model",
  providerHideDesc: "keep it in models.json, hide it from /model",
  providerUnhide: "Show in /model",
  providerUnhideDesc: "list it in /model again",
  providerBackup: "Back up provider",
  providerBackupDesc: "write a JSON copy next to models.json",
  providerDeleteModels: "Delete models…",
  providerDeleteModelsDesc: "remove selected models, keep the provider",
  providerDeleteProvider: "Delete provider",
  providerDeleteProviderDesc: "remove the provider and all of its models",
  modelsTitle: (name) => `${name} · models`,
  modelsSubtitle: "enter a model to edit its capabilities",
  editedModel: (name, id) => `Updated ${id} on ${name}`,

  settingsTitle: "Settings",
  settingsLanguage: "Language",
  settingsLanguageDesc: (current) => `currently ${current}`,
  settingsCache: "Refresh models.dev cache",
  settingsCacheDesc: "re-download the official model catalog",
  settingsBack: "Back",
  languageTitle: "Language",
  languageCurrent: "current",

  answerYes: "Yes",
  answerNo: "No",
  unknownTime: "unknown time",
  sourceHeuristic: "heuristic",
  secretHidden: "(hidden)",
  emptyList: "Nothing to choose from here",

  footerSelect: "↑↓ move • enter select • esc back",
  footerSelectExit: "↑↓ move • enter select • esc exit",
  footerConfirm: "↑↓ move • enter confirm • esc back",
  footerInput: "enter confirm • esc back",
  footerSecret: "input hidden • enter confirm • esc back",
  footerLoader: "esc cancel",
  footerFilter: (filter) => (filter ? `filter: ${filter}` : "type to filter"),

  stepLabel: (step, total, what) => `step ${step}/${total} · ${what}`,
  stepName: "provider name",
  stepApi: "API type",
  stepBaseUrl: "endpoint URL",
  stepUserAgent: "User-Agent",
  stepApiKey: "API key",
  inputProviderName: "Provider name",
  errNameFormat: "Name must match [A-Za-z0-9][A-Za-z0-9_-]{0,31}",
  builtinName: "Built-in name",
  builtinNameConfirm: (s) => `${s} is a built-in / reserved provider id. Override it?`,
  existsMerge: "Exists",
  existsMergeMsg: (name) => `${name} already exists. Merge new models into it?`,
  secretApiKey: "API key",

  selectApiType: "API type",
  apiTypeDescription: (api) => {
    switch (api) {
      case "openai-completions":
        return "most relays · /chat/completions";
      case "openai-responses":
        return "OpenAI Responses API";
      case "openai-codex-responses":
        return "ChatGPT/Codex subscription backend";
      case "anthropic-messages":
        return "Claude / Anthropic-compatible relays";
      case "google-generative-ai":
        return "Gemini API";
      default:
        return "";
    }
  },
  inputBaseUrl: "baseUrl",
  confirmUserAgent: "User-Agent",
  confirmUserAgentMsg: "Send User-Agent: node ?",
  addAnotherApi: "Add another API?",
  addAnotherApiMsg: (count) => `${count} API(s) so far. Add another protocol/URL?`,

  groupTitle: (index) => `Model group ${index}`,
  groupAnotherKey: "Add another key/group?",
  groupAnotherKeyMsg: "Same URL, different API key for different model group?",
  groupSkipped: (providerId) => `Skipped ${providerId}: provider already exists and merge was declined`,

  fetchingModels: (api, baseUrl) => `Fetching ${api} models…`,
  noModelsReturned: "No models returned by this API",
  inputManualIds: "Model ids (comma-separated), or empty to skip",
  catalogFailed: "catalog failed",
  htmlSuggestV1: (url) => `Response looked like HTML. Try ${url}`,

  conflictLabel: "! conflict",
  multiSelectAll: "Select all",
  multiSelectInvert: "Invert",
  multiSelectNone: "Deselect all",
  multiSelectFilter: (filter) => (filter ? `filter: ${filter}` : "type to filter"),
  multiSelectFooter: (count) =>
    `space toggle • ^A all • ^R invert • ^U none • ^H hidden • enter ${count} • esc`,
  multiSelectNoMatch: "no matches",
  multiSelectNothing: "select at least one model",
  multiSelectHidden: (on) => `hidden models: ${on ? "shown" : "off"}`,

  lookingUp: (count) => `Looking up ${count} new model(s) on models.dev…`,
  modelsDevCatalog: (at) => `models.dev catalog: ${at}`,

  confirmFuzzyTitle: "Confirm fuzzy model match",
  confirmFuzzyMsg: (id, bucket, officialId) =>
    `${id}\n→ ${bucket}/${officialId}\nUse this model's capabilities?`,

  idExistsTitle: (id) => `id "${id}" already exists`,
  idExistsKeep: "keep existing",
  idExistsReplace: "replace with this API",
  idExistsSkip: "skip",

  editCapsTitle: (n) => `Edit capabilities for ${n} model(s)?`,
  editCapsSkip: "skip (keep defaults)",
  editCapsAll: "edit all",
  editCapsPick: "pick which to edit",
  editCapsCancel: "cancel",
  editCapsSubtitle: "Defaults already follow builtin / models.dev. Aliased relay ids keep those caps.",

  nothingToWrite: "Nothing to write",
  errDraftMissingEndpoint: "internal: draft missing api/baseUrl",
  confirmWriteTitle: "Write models.json?",
  confirmWriteMsg: (n, provider) => `${n} model(s) → ${provider}`,
  confirmWriteMode: (mode) => `mode: ${mode}`,
  confirmWriteMore: (n) => `+${n} more not shown`,
  refreshFailed: (err, backup) => `refresh failed: ${err}${backup ? `\nbackup: ${backup}` : ""}`,
  confirmRollback: "Rollback models.json?",
  confirmRollbackRestore: (p) => `Restore ${p}?`,
  confirmRollbackRemove: "Remove the newly created models.json?",
  rollbackRefreshFailed: (err) => `Rollback refresh failed: ${err}`,
  rolledBack: "models.json rolled back",
  addedModels: (added, replaced, provider, apis, conflicts) =>
    `Added ${added} model(s), replaced ${replaced} on ${provider} (${apis})${conflicts ? `; skipped ${conflicts} conflict(s)` : ""}`,
  sunkThinkingMsg: "Moved provider thinkingFormat onto existing OpenAI models before adding native API",
  confirmSwitchModel: "Switch model?",
  confirmSwitchModelMsg: (provider, id) => `Switch to ${provider}/${id}?`,
  setModelFailed: "setModel failed (missing key?)",
  setDefaultFailed: "Could not write default model to settings.json",
  switchedDefault: (provider, id) => `Default model is now ${provider}/${id}`,
  defaultModelCurrent: (provider, id) => `Current default: ${provider}/${id}`,
  defaultModelUnset: "No default model is set",
  selectDefaultModel: "Default model",
  noModelsAnywhere: "No models in models.json",
  confirmSetDefault: "Set as default?",
  confirmSetDefaultMsg: (provider, id) =>
    `Save ${provider}/${id} as the startup default?\nWrites settings.json and switches this session.`,

  noProvidersCreateFirst: "No providers in models.json. Create one first.",
  selectProvider: "Provider",
  secretApiKeyFor: (name) => `API key for ${name}`,
  applyHowTitle: "How to apply?",
  applyHowMerge: "merge models",
  applyHowMergeDesc: "keep what is already stored",
  applyHowReplace: "replace these API endpoints",
  applyHowReplaceDesc: "drop the old models of this endpoint",
  applyHowCancel: "cancel",
  applyHowCancelDesc: "write nothing and go back",
  applyHowDiscarded: (count) => `Nothing written; ${count} selected model(s) discarded`,

  refreshingCache: "Refreshing models.dev…",
  refreshingCacheResult: (n, at) => `cached ${n} official buckets at ${at}`,
  cacheCancelled: "cancelled",

  noProvidersInFile: "No providers in models.json",
  confirmDeleteProvider: "Delete provider?",
  confirmDeleteProviderMsg: (name, count) => `Remove ${name} and its ${count} model(s) from models.json?`,
  deletedProvider: (name, backup) => `Deleted ${name} (copy at ${backup})`,
  deleteModelsTitle: (name) => `Delete models from ${name}`,
  noModels: (name) => `${name} has no models`,
  confirmDeleteModels: "Delete models?",
  confirmDeleteModelsMsg: (n, name, ids) => `${n} model(s) from ${name}:\n${ids.slice(0, 12).join("\n")}`,
  deletedModels: (n, name) => `Deleted ${n} model(s) from ${name}`,
  backedUpProvider: (name, path) => `Backed up ${name} → ${path}`,
  hideProviderTitle: "Hide from /model",
  hideProviderNone: "Every provider in models.json is already hidden",
  confirmHideProvider: "Hide provider",
  confirmHideProviderMsg: (name, count) =>
    `Hide all ${count} model(s) of ${name} from /model? They stay in models.json and can be shown again.`,
  hiddenProvider: (name) => `Hidden ${name}. /model no longer lists it; models.json is unchanged.`,
  unhideProviderTitle: "Show in /model",
  unhideProviderNone: "No hidden providers",
  unhideStale: (names) => `Dropped stale hide entries: ${names}`,
  unhiddenProvider: (name) => `Showing ${name} in /model again.`,
  refreshModelsTitle: "Refresh models",
  refreshNoEndpoint: (name) => `${name} has no stored api + baseUrl to refresh`,
  refreshNeedKey: (name) => `${name} has no usable API key. Enter one to fetch the catalog.`,
  refreshEndpointTitle: (name) => `Endpoint to refresh for ${name}`,
  refreshRemovedTitle: (name) => `Models no longer in the catalog (${name})`,
  refreshNothingChanged: "Catalog matches models.json. Nothing to write.",
  refreshedModels: (added, removed, name) =>
    `Updated ${name}: added ${added}, removed ${removed}. Name and API were not changed.`,

  editName: (name) => `name: ${name}`,
  editContextWindow: (n) => `contextWindow: ${n}`,
  editMaxTokens: (n) => `maxTokens: ${n}`,
  editInput: (input) => `input: ${input}`,
  editReasoning: (on) => `reasoning: ${on ? "yes" : "no"}`,
  editThinkingMap: (summary) => `thinkingLevelMap  ${summary}`,
  editReset: "reset to builtin / heuristic",
  editDone: "done",
  resetFromMsg: (id, source) => `Reset ${id} from ${source}`,
  inputDisplayName: "Display name",
  inputContextWindow: "contextWindow",
  inputMaxTokens: "maxTokens",
  selectInput: "input",
  inputText: "text",
  inputTextImage: "text+image",
  selectReasoning: "reasoning",
  reasoningYes: "yes",
  reasoningNo: "no",
  reasoningOn: "reasoning",
  reasoningOff: "no reasoning",
  thinkingHidden: "hidden",
  thinkingMapAllHidden: "(all hidden)",
  thinkingHide: "hide (null)",
  thinkingUseLevelName: "use level name",
  thinkingNone: "none",
  thinkingDisabled: "disabled",
  thinkingEnabled: "enabled",
  thinkingCustom: "custom",
  thinkingBack: "back",
  thinkingCustomValue: (level) => `${level} value`,

  inputBackfilled: (count, detail) =>
    `Backfilled image input for ${count} model(s): ${detail}`,
  inputBackfillFailed: (err) => `Could not backfill model input lists: ${err}`,

  errInteractiveOnly: "pim is interactive-only (TUI)",

  usageTitle: "Token usage",
  usageRangeTitle: "Time range",
  usageRangeAll: "All time",
  usageRange7d: "Last 7 days",
  usageRange30d: "Last 30 days",
  usageScanning: "Scanning session files…",
  usageSummary: (total, input, output, cacheRead, messages, files) =>
    `total ${total}  =  in ${input} + out ${output} + cache ${cacheRead}   ·   ${messages} calls · ${files} files`,
  usageSummaryShort: (total, messages) => `total ${total} · ${messages} calls`,
  usageHeaderProvider: "provider",
  usageHeaderModel: "model",
  usageHeaderTotal: "total",
  usageHeaderInput: "input",
  usageHeaderOutput: "output",
  usageHeaderCache: "cache",
  usageHeaderMessages: "calls",
  usageEmpty: "No token usage recorded in this range",
  usageHiddenColumns: (columns) => `narrow: ${columns.join(" / ")} hidden`,
  usageLevelModels: (provider) => `${provider} · models`,
  usageFooterProviders: "↑↓ scroll • enter models • ←→ sort • r rescan • esc exit",
  usageFooterModels: "↑↓ scroll • ←→ sort • r rescan • esc back",
};

const zh: Strings = {
  menuTitle: "pim",
  menuProviders: "Provider 与模型",
  menuProvidersDesc: "查看、编辑、隐藏、备份、删除",
  menuSwitchDefault: "切换默认模型",
  menuSwitchDefaultDesc: "选择启动时加载的模型",
  menuNew: "新建 provider",
  menuNewDesc: "添加一个中转端点并拉取模型",
  menuAdd: "添加 API / 模型",
  menuAddDesc: "给已有 provider 增加端点或 key",
  menuUsage: "Token 消耗",
  menuUsageDesc: "按 provider / 模型统计各 session 用量",
  menuSettings: "设置",
  menuSettingsDesc: "语言、models.dev 缓存",
  menuExit: "退出",
  menuExitDesc: "关闭 /pim",
  menuStatus: (providers, models, current) =>
    `${providers} 个 provider · ${models} 个模型 · ${current ? `默认 ${current}` : "未设默认模型"}`,

  providersTitle: "Provider 列表",
  providersEmpty: "models.json 里还没有 provider。用「新建 provider」添加一个。",
  providerStatus: (models, api, hidden) =>
    `${models} 个模型 · ${api}${hidden ? " · 已从 /model 隐藏" : ""}`,
  providerModels: "模型与能力",
  providerModelsDesc: "列出模型、编辑能力、删除部分",
  providerSetDefault: "设为默认模型",
  providerSetDefaultDesc: "从该 provider 中选一个模型",
  providerAddApi: "添加 API / 模型",
  providerAddApiDesc: "为该 provider 增加端点或 key",
  providerRefresh: "从目录刷新",
  providerRefreshDesc: "与 provider 接口同步模型 id",
  providerHide: "从 /model 隐藏",
  providerHideDesc: "保留在 models.json，只是不在 /model 列出",
  providerUnhide: "在 /model 显示",
  providerUnhideDesc: "重新在 /model 中列出",
  providerBackup: "备份 provider",
  providerBackupDesc: "在 models.json 旁写一份 JSON 副本",
  providerDeleteModels: "删除模型…",
  providerDeleteModelsDesc: "删除选中的模型，保留 provider",
  providerDeleteProvider: "删除 provider",
  providerDeleteProviderDesc: "删除该 provider 及其全部模型",
  modelsTitle: (name) => `${name} · 模型`,
  modelsSubtitle: "enter 编辑该模型的能力",
  editedModel: (name, id) => `已更新 ${name} 上的 ${id}`,

  settingsTitle: "设置",
  settingsLanguage: "语言",
  settingsLanguageDesc: (current) => `当前 ${current}`,
  settingsCache: "刷新 models.dev 缓存",
  settingsCacheDesc: "重新下载官方模型目录",
  settingsBack: "返回",
  languageTitle: "语言",
  languageCurrent: "当前",

  answerYes: "是",
  answerNo: "否",
  unknownTime: "未知时间",
  sourceHeuristic: "启发式",
  secretHidden: "（已隐藏）",
  emptyList: "这里没有可选项",

  footerSelect: "↑↓ 移动 • enter 选择 • esc 返回",
  footerSelectExit: "↑↓ 移动 • enter 选择 • esc 退出",
  footerConfirm: "↑↓ 移动 • enter 确认 • esc 返回",
  footerInput: "enter 确认 • esc 返回",
  footerSecret: "输入已隐藏 • enter 确认 • esc 返回",
  footerLoader: "esc 取消",
  footerFilter: (filter) => (filter ? `过滤: ${filter}` : "输入以过滤"),

  stepLabel: (step, total, what) => `第 ${step}/${total} 步 · ${what}`,
  stepName: "provider 名称",
  stepApi: "API 类型",
  stepBaseUrl: "端点 URL",
  stepUserAgent: "User-Agent",
  stepApiKey: "API key",
  inputProviderName: "Provider 名称",
  errNameFormat: "名称须匹配 [A-Za-z0-9][A-Za-z0-9_-]{0,31}",
  builtinName: "内置名称",
  builtinNameConfirm: (s) => `${s} 是内置 / 保留 provider id。要覆盖吗？`,
  existsMerge: "已存在",
  existsMergeMsg: (name) => `${name} 已存在。合并新模型？`,
  secretApiKey: "API key",

  selectApiType: "API 类型",
  apiTypeDescription: (api) => {
    switch (api) {
      case "openai-completions":
        return "多数中转站 · /chat/completions";
      case "openai-responses":
        return "OpenAI Responses API";
      case "openai-codex-responses":
        return "ChatGPT/Codex 订阅后端";
      case "anthropic-messages":
        return "Claude / Anthropic 兼容中转";
      case "google-generative-ai":
        return "Gemini API";
      default:
        return "";
    }
  },
  inputBaseUrl: "baseUrl",
  confirmUserAgent: "User-Agent",
  confirmUserAgentMsg: "发送 User-Agent: node ？",
  addAnotherApi: "再添加一条 API？",
  addAnotherApiMsg: (count) => `已有 ${count} 条 API。再添加一个协议/URL？`,

  groupTitle: (index) => `模型分组 ${index}`,
  groupAnotherKey: "添加另一个 key/分组？",
  groupAnotherKeyMsg: "同一 URL，不同 API key 对应不同模型分组？",
  groupSkipped: (providerId) => `已跳过 ${providerId}：provider 已存在且未选择合并`,

  fetchingModels: (api, baseUrl) => `正在拉取 ${api} 模型（${baseUrl}）…`,
  noModelsReturned: "此 API 未返回模型",
  inputManualIds: "模型 id（逗号分隔），留空跳过",
  catalogFailed: "拉取失败",
  htmlSuggestV1: (url) => `响应看起来是 HTML。试试 ${url}`,

  conflictLabel: "! 冲突",
  multiSelectAll: "全选",
  multiSelectInvert: "反选",
  multiSelectNone: "全不选",
  multiSelectFilter: (filter) => (filter ? `过滤: ${filter}` : "输入过滤"),
  multiSelectFooter: (count) =>
    `空格 勾选 • ^A全选 • ^R反选 • ^U全不选 • ^H隐藏 • enter ${count} • esc`,
  multiSelectNoMatch: "无匹配项",
  multiSelectNothing: "至少选择一个模型",
  multiSelectHidden: (on) => `隐藏模型：${on ? "已显示" : "关闭"}`,

  lookingUp: (count) => `正在 models.dev 查询 ${count} 个新模型…`,
  modelsDevCatalog: (at) => `models.dev 目录：${at}`,

  confirmFuzzyTitle: "确认模糊匹配",
  confirmFuzzyMsg: (id, bucket, officialId) =>
    `${id}\n→ ${bucket}/${officialId}\n使用此模型的能力？`,

  idExistsTitle: (id) => `id "${id}" 已存在`,
  idExistsKeep: "保留已有",
  idExistsReplace: "用此 API 替换",
  idExistsSkip: "跳过",

  editCapsTitle: (n) => `编辑 ${n} 个模型的能力？`,
  editCapsSkip: "跳过（保留默认）",
  editCapsAll: "全部编辑",
  editCapsPick: "选择要编辑的",
  editCapsCancel: "取消",
  editCapsSubtitle: "默认值已按内置 / models.dev 设定。中转 id 保留其能力。",

  nothingToWrite: "无可写入内容",
  errDraftMissingEndpoint: "内部错误：draft 缺少 api/baseUrl",
  confirmWriteTitle: "写入 models.json？",
  confirmWriteMsg: (n, provider) => `${n} 个模型 → ${provider}`,
  confirmWriteMode: (mode) => `写入方式：${mode}`,
  confirmWriteMore: (n) => `另有 ${n} 条未显示`,
  refreshFailed: (err, backup) => `刷新失败：${err}${backup ? `\n备份：${backup}` : ""}`,
  confirmRollback: "回滚 models.json？",
  confirmRollbackRestore: (p) => `恢复 ${p}？`,
  confirmRollbackRemove: "删除刚创建的 models.json？",
  rollbackRefreshFailed: (err) => `回滚刷新失败：${err}`,
  rolledBack: "models.json 已回滚",
  addedModels: (added, replaced, provider, apis, conflicts) =>
    `已添加 ${added} 个模型，替换 ${replaced} 个，目标 ${provider}（${apis}）${conflicts ? `；跳过 ${conflicts} 个冲突` : ""}`,
  sunkThinkingMsg: "添加原生 API 前，已将 provider thinkingFormat 下沉到已有 OpenAI 模型",
  confirmSwitchModel: "切换模型？",
  confirmSwitchModelMsg: (provider, id) => `切换到 ${provider}/${id}？`,
  setModelFailed: "setModel 失败（缺少 key？）",
  setDefaultFailed: "无法把默认模型写入 settings.json",
  switchedDefault: (provider, id) => `默认模型已设为 ${provider}/${id}`,
  defaultModelCurrent: (provider, id) => `当前默认：${provider}/${id}`,
  defaultModelUnset: "尚未设置默认模型",
  selectDefaultModel: "默认模型",
  noModelsAnywhere: "models.json 中没有模型",
  confirmSetDefault: "设为默认？",
  confirmSetDefaultMsg: (provider, id) => `把 ${provider}/${id} 设为启动默认模型？\n会写入 settings.json 并切换当前会话。`,

  noProvidersCreateFirst: "models.json 中没有 provider。请先创建。",
  selectProvider: "Provider",
  secretApiKeyFor: (name) => `${name} 的 API key`,
  applyHowTitle: "如何应用？",
  applyHowMerge: "合并模型",
  applyHowMergeDesc: "保留已存的模型",
  applyHowReplace: "替换这些 API 端点",
  applyHowReplaceDesc: "丢掉该端点下的旧模型",
  applyHowCancel: "取消",
  applyHowCancelDesc: "不写盘，返回上一层",
  applyHowDiscarded: (count) => `未写入，已放弃 ${count} 个选中的模型`,

  refreshingCache: "正在刷新 models.dev…",
  refreshingCacheResult: (n, at) => `已缓存 ${n} 个官方桶，时间 ${at}`,
  cacheCancelled: "已取消",

  noProvidersInFile: "models.json 中没有 provider",
  confirmDeleteProvider: "删除 provider？",
  confirmDeleteProviderMsg: (name, count) => `从 models.json 中删除 ${name} 及其 ${count} 个模型？`,
  deletedProvider: (name, backup) => `已删除 ${name}（备份在 ${backup}）`,
  deleteModelsTitle: (name) => `从 ${name} 删除模型`,
  noModels: (name) => `${name} 没有模型`,
  confirmDeleteModels: "删除模型？",
  confirmDeleteModelsMsg: (n, name, ids) => `从 ${name} 删除 ${n} 个模型：\n${ids.slice(0, 12).join("\n")}`,
  deletedModels: (n, name) => `从 ${name} 删除了 ${n} 个模型`,
  backedUpProvider: (name, path) => `已备份 ${name} → ${path}`,
  hideProviderTitle: "从 /model 隐藏",
  hideProviderNone: "models.json 里的 provider 都已隐藏",
  confirmHideProvider: "隐藏 provider",
  confirmHideProviderMsg: (name, count) =>
    `从 /model 隐藏 ${name} 的全部 ${count} 个模型？它们仍留在 models.json，可以再显示。`,
  hiddenProvider: (name) => `已隐藏 ${name}。/model 不再列出它，models.json 未改。`,
  unhideProviderTitle: "在 /model 重新显示",
  unhideProviderNone: "没有已隐藏的 provider",
  unhideStale: (names) => `已清除失效的隐藏记录：${names}`,
  unhiddenProvider: (name) => `已在 /model 重新显示 ${name}。`,
  refreshModelsTitle: "刷新模型",
  refreshNoEndpoint: (name) => `${name} 没有已保存的 api + baseUrl，无法刷新`,
  refreshNeedKey: (name) => `${name} 没有可用的 API key。输入一个来拉取目录。`,
  refreshEndpointTitle: (name) => `刷新 ${name} 的端点`,
  refreshRemovedTitle: (name) => `目录里已经没有的模型（${name}）`,
  refreshNothingChanged: "目录与 models.json 一致，没有要写的改动。",
  refreshedModels: (added, removed, name) => `已更新 ${name}：新增 ${added}，删除 ${removed}。名称和 API 未改。`,

  editName: (name) => `名称：${name}`,
  editContextWindow: (n) => `上下文窗口：${n}`,
  editMaxTokens: (n) => `最大输出：${n}`,
  editInput: (input) => `输入：${input}`,
  editReasoning: (on) => `推理：${on ? "是" : "否"}`,
  editThinkingMap: (summary) => `思考档位  ${summary}`,
  editReset: "重置为内置 / 启发式",
  editDone: "完成",
  resetFromMsg: (id, source) => `已从 ${source} 重置 ${id}`,
  inputDisplayName: "显示名称",
  inputContextWindow: "上下文窗口",
  inputMaxTokens: "最大输出",
  selectInput: "输入",
  inputText: "纯文本",
  inputTextImage: "文本+图片",
  selectReasoning: "推理",
  reasoningYes: "是",
  reasoningNo: "否",
  reasoningOn: "推理",
  reasoningOff: "无推理",
  thinkingHidden: "隐藏",
  thinkingMapAllHidden: "（全部隐藏）",
  thinkingHide: "隐藏 (null)",
  thinkingUseLevelName: "用档位名",
  thinkingNone: "none",
  thinkingDisabled: "disabled",
  thinkingEnabled: "enabled",
  thinkingCustom: "自定义",
  thinkingBack: "返回",
  thinkingCustomValue: (level) => `${level} 的值`,

  inputBackfilled: (count, detail) => `已为 ${count} 个模型补齐 image 输入能力：${detail}`,
  inputBackfillFailed: (err) => `补齐模型 input 能力失败：${err}`,

  errInteractiveOnly: "pim 仅在 TUI 交互模式下可用",

  usageTitle: "Token 消耗",
  usageRangeTitle: "时间范围",
  usageRangeAll: "全部",
  usageRange7d: "最近 7 天",
  usageRange30d: "最近 30 天",
  usageScanning: "正在扫描 session 文件…",
  usageSummary: (total, input, output, cacheRead, messages, files) =>
    `总计 ${total}  =  输入 ${input} + 输出 ${output} + 缓存 ${cacheRead}   ·   ${messages} 次调用 · ${files} 个文件`,
  usageSummaryShort: (total, messages) => `总计 ${total} · ${messages} 次调用`,
  usageHeaderProvider: "provider",
  usageHeaderModel: "模型",
  usageHeaderTotal: "总计",
  usageHeaderInput: "输入",
  usageHeaderOutput: "输出",
  usageHeaderCache: "缓存",
  usageHeaderMessages: "次数",
  usageEmpty: "该范围内没有 token 记录",
  usageHiddenColumns: (columns) => `窗口过窄：已隐藏 ${columns.join(" / ")}`,
  usageLevelModels: (provider) => `${provider} · 模型`,
  usageFooterProviders: "↑↓ 滚动 • enter 看模型 • ←→ 排序 • r 重扫 • esc 退出",
  usageFooterModels: "↑↓ 滚动 • ←→ 排序 • r 重扫 • esc 返回",
};

const TABLES: Record<Lang, Strings> = { en, zh };

let currentLang: Lang = "en";

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function t(): Strings {
  return TABLES[currentLang];
}

export function otherLang(lang: Lang): Lang {
  return lang === "en" ? "zh" : "en";
}

export function langLabel(lang: Lang): string {
  return lang === "zh" ? "中文" : "English";
}

export async function loadLang(): Promise<Lang> {
  const sidecar = await readSidecar();
  const stored = (sidecar as Sidecar & { lang?: string }).lang;
  if (stored === "zh" || stored === "en") {
    currentLang = stored;
  }
  return currentLang;
}

export async function saveLang(lang: Lang): Promise<void> {
  currentLang = lang;
  const sidecar = await readSidecar();
  (sidecar as Sidecar & { lang?: string }).lang = lang;
  await writeSidecar(sidecar).catch(() => {});
}
