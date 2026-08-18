# @palmtom/pi-models

Pi TUI overlay that adds a relay or self-hosted gateway to `models.json`.
Pick a protocol and URL, fetch `/models`, multi-select, and write capabilities
so `/model` can switch immediately.

中转站 / 自建网关接入向导：在 Pi 里用 70% overlay 拉目录、勾选模型、写入
`models.json`，然后 `/model` 即可切换。界面支持 English / 中文。

[![npm](https://img.shields.io/npm/v/@palmtom/pi-models)](https://www.npmjs.com/package/@palmtom/pi-models)
[![pi.dev](https://img.shields.io/badge/pi.dev-packages-0ea5e9)](https://pi.dev/packages/@palmtom/pi-models)
[![license](https://img.shields.io/npm/l/@palmtom/pi-models)](./LICENSE)

## Install

```sh
pi install npm:@palmtom/pi-models
```

From git, or for a one-off session without changing settings:

```sh
pi install git:github.com/palmtom316/pi-models
pi -e npm:@palmtom/pi-models
pi --extension /absolute/path/to/pi-models
```

Requires [Pi](https://pi.dev) **≥ 0.84.2** and Node **≥ 22**. Interactive TUI
only — print / json / rpc modes refuse to write.

Then in Pi:

```
/pim
```

Aliases: `/pim-models`, `/add-provider`.

## What you get

- **70% theme-aware overlay.** Every select / confirm / input / secret /
  multi-select / loader lives in a centered overlay that tracks terminal
  resize and uses Pi theme tokens (`accent`, `muted`, `border`, `selectedBg`).
- **New provider.** Name + one `api`/`baseUrl`, then loop API keys. Each extra
  key becomes `NAME-2`, `NAME-3`, … because Pi stores `apiKey` on the provider,
  not on the model.
- **Add API to an existing provider.** Extra protocol + URL on the same key
  (New API OpenAI + native Claude, etc.). Each model is written with its own
  `api` and `baseUrl`.
- **Catalog fetch.** OpenAI `{ data: [{ id }] }`, `{ models }`, Anthropic
  `display_name`, Gemini `models/…`. Empty or failed catalogs can be typed by
  hand. HTML homepages suggest appending `/v1` (never rewritten silently).
- **Capability matching.** Daily-driver ids resolve offline from a builtin
  table. Unknown selected ids fetch [models.dev](https://models.dev) official
  lab buckets. Relay ids such as `deepseek-ai/deepseek-v4-flash-0731` keep that
  write id and copy official `deepseek-v4-flash` caps.
- **Manage / view.** Backup or delete a provider, delete selected models, edit
  caps (or reset to builtin / heuristic), browse what is already in
  `models.json`.
- **Safe write.** Atomic rename, mode `0600`, rotating `models.json.bak-*`,
  `refresh()` + rollback if Pi rejects the file. Keys never appear in logs,
  toasts, or the sidecar.

This package writes **your** `models.json`. It does not talk to CC-Switch —
that is [pi-ccs](https://github.com/palmtom316/pi-ccs).

## Commands

| Command | Action |
| --- | --- |
| `/pim` | Open the overlay |
| `/pim-models` | Same |
| `/add-provider` | Same |

Menu:

1. **New provider** — name, API type, base URL, then one or more keys.
2. **Add API / models** — attach another protocol/URL (or more models) to an
   existing provider.
3. **Manage** — backup / delete provider / delete models / edit capabilities.
4. **View** — browse providers and models; delete inline.
5. **Refresh models.dev cache** — force-refresh the official-bucket cache.
6. **Language** — English ↔ 中文 (stored in the sidecar).

## New provider

1. Name: `^[A-Za-z][A-Za-z0-9_-]{0,31}$`. Built-in ids (`openai`,
   `anthropic`, `google`, `cc-switch-*`, …) need a second confirm — that
   overrides the built-in provider.
2. API type (default should stay `openai-completions` on most relays):

   | `api` | Typical use |
   | --- | --- |
   | `openai-completions` | New API / One API / most relays |
   | `openai-responses` | OpenAI Responses / some Grok |
   | `openai-codex-responses` | Codex; do not pick this as a default |
   | `anthropic-messages` | Native Claude endpoint |
   | `google-generative-ai` | Native Gemini endpoint |

   Relays almost always serve Claude / Gemini over `openai-completions`.
   Pick a native API only when the site actually exposes that protocol.
3. `baseUrl` — HTTPS required (HTTP only for localhost). Query, hash, and
   userinfo are stripped / rejected.
4. Optional `User-Agent: node` (on by default; many WAFs block `OpenAI/JS`).
5. Masked API key → fetch catalog → multi-select (filter, space to toggle,
   official hits checked, embeddings / TTS / image / video folded).
6. Same URL, another key? Confirm and repeat. Extra groups write as
   `NAME-2`, `NAME-3`.
7. Confirm → backup → write → `modelRegistry.refresh()`. Optionally jump to
   the first new model.

## Add API to an existing provider

Same overlay, but you pick a provider that already has a key and loop
`api` + `baseUrl`. Then:

- **Merge** new models by id, or
- **Replace** only the `(api, baseUrl)` groups you just fetched.

Same id on two APIs cannot both live on one provider (Pi sends `id` upstream
unchanged). The wizard asks keep / replace / skip — it never silently
overwrites.

Before a non-OpenAI model is added, provider-level `thinkingFormat` /
`requiresReasoningContentOnAssistantMessages` are copied onto existing
OpenAI models and removed from the provider. Otherwise a new Claude row
would inherit `thinkingFormat: "deepseek"`.

## Capability source

Priority, in order:

1. **Builtin table** (`src/builtin-catalog.ts`) — exact / alias only, no
   fuzzy. Claude entries are pinned to 1M context.

   | Lab | Ids |
   | --- | --- |
   | openai | `gpt-5.5` `gpt-5.6-sol` `gpt-5.6-terra` `gpt-5.6-luna` |
   | anthropic | `claude-opus-5` `claude-opus-4-8` `claude-fable-5` `claude-sonnet-5` |
   | xai | `grok-4.5` `grok-4.6` |
   | deepseek | `deepseek-v4-flash` `deepseek-v4-pro` |
   | zhipuai | `glm-5.2` `glm-5.3` |
   | google | `gemini-3.7-flash` |
   | moonshotai | `kimi-k3` |

2. **models.dev official buckets** — only for selected ids the builtin table
   does not know. Cached under `{agentDir}/cache/models.dev.json` (ETag,
   24h TTL). Reseller / `*-plan` / `*-cn` copies are never used as defaults.
   Cost is ignored.

3. **Heuristic** — last resort, marked as such (family-sized windows, not
   an official object).

Match normalizes the catalog id (lowercase, drop `vendor/`, drop `-think` /
`-0731`) but **writes the upstream id unchanged**. Fuzzy hits must be
confirmed. `gpt-5` is not auto-upgraded to `gpt-5.6-*`.

Per-model compat the wizard may set:

| When | `compat` |
| --- | --- |
| Claude 4.6+ on `anthropic-messages` | `forceAdaptiveThinking` |
| GLM / Z.AI | `thinkingFormat: "zai"` |
| DeepSeek + `reasoning_content` | `thinkingFormat: "deepseek"` |
| Kimi K3 on OpenAI APIs | `thinkingFormat: "openai"` |

New models omit `cost` (Pi defaults to 0). Hand-written cost is kept on
merge. You can edit name / window / maxTokens / input / reasoning /
`thinkingLevelMap`, or reset to the current builtin / heuristic. Id, api,
baseUrl, and cost are not editable here.

## Files

Respects `PI_CODING_AGENT_DIR` (default `~/.pi/agent`):

| Path | Role |
| --- | --- |
| `models.json` | Providers + models. Mode `0600`. |
| `models.json.bak-YYYYMMDD-HHMMSS-mmm` | Pre-write snapshot; last 10 kept. |
| `backups/{provider}-….json` | Per-provider snapshots from Manage. |
| `cache/models.dev.json` | Official-bucket cache. No keys, no prices. |
| `pim-models.json` | Language + last endpoints. No keys. |

Each written model carries its own `api` and `baseUrl`. Provider-level
compat stays limited to relay-safe flags
(`supportsDeveloperRole: false`, `supportsLongCacheRetention: false`,
`supportsReasoningEffort: true`).

## Safety

- Commands no-op outside `ctx.mode === "tui"`.
- HTTPS only; HTTP allowed solely for localhost / `127.0.0.1` / `::1`.
- No URL userinfo; query and hash stripped; no cross-origin redirects.
- Catalog body capped; errors show status + a short redacted body.
- Notify / logs redact `Authorization`, `apiKey`, and `sk-…`.
- Keys in `models.json` are as plaintext as Pi already stores them. Treat
  backups as secret copies.

## Development

```sh
npm install
npm test          # Node ≥ 22, --experimental-strip-types
```

Load a checkout:

```sh
pi --extension /absolute/path/to/pi-models
```

Design notes: [docs/SPEC.md](docs/SPEC.md).

## License

[MIT](./LICENSE)
