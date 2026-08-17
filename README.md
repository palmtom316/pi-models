# pi-models

Pi TUI **overlay** wizard: add a relay / self-hosted gateway as **one provider with one or more APIs**. The overlay is sized to **70% of the pi-agent window** and resizes live with the terminal; it uses pi-agent's theme tokens for identical colors. Open it with `/pim` inside pi, or install it:

```sh
pi install npm:@palmtom/pi-models
pi install git:github.com/palmtom316/pi-models
```

Each API lists models. Daily-driver caps (GPT-5.6 / Claude 5 / Grok / DeepSeek V4 / GLM-5 / Gemini 3.7 / Kimi K3) are built in; unknown ids fetch [models.dev](https://models.dev) official buckets. Writes `models.json`, then `/model` can switch.

## Use

```sh
pi --extension /absolute/path/to/pi-models
```

Then `/pim` (aliases `/pim-models`, `/add-provider`):

1. New provider, or add APIs to an existing one.
2. Loop: pick `api` + `baseUrl` (openai-completions, anthropic-messages, …).
3. Fetch `/models`, multi-select. Relay ids like `deepseek-v4-flash-0731` keep that write id and copy builtin `deepseek-v4-flash` caps; you can edit them.
4. Confirm → backup → write → `modelRegistry.refresh()`.
5. Manage menu: backup / delete a provider, delete selected models, edit caps.
6. View existing providers & models from models.json; delete inline.
7. Language: switch between English / 中文 in the overlay.

All dialogs (select / confirm / input / secret / loader / multi-select) render inside the 70% overlay.

## Docs

- Spec: [docs/SPEC.md](docs/SPEC.md)
- Review: [docs/REVIEW.md](docs/REVIEW.md)

## Dev

```sh
npm test
```

Requires Node ≥ 22 (`--experimental-strip-types`).
