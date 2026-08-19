# pi-models 规格审查

- **日期：** 2026-08-17
- **范围：** `docs/SPEC.md`（实现尚未开始）。对照 Pi 0.84.2 契约、本机 `~/.pi/agent/models.json`、models.dev 官方目录，以及同类项目实现路径。
- **基线：** `@earendil-works/pi-coding-agent` 0.84.2；本机 Node v24.18.0
- **结论：** 产品定位对，和 `pi-ccs` 的边界也清楚。但规格里有几处会直接写错 `models.json` 或让向导在真实目录上匹配失败。
- **范围修订（2026-08-17 +46m）：** 用户确认 **首版必须实现 1 个 provider × 多条 API**。下文 §8/§9 里把多 API 推到 v0.2 的建议作废；`docs/SPEC.md` 已按多 API 一等公民改写（强制模型级 `api`/`baseUrl`、compat 下沉、同 id 不改名）。
- **能力源修订：** 常用模型（GPT-5.5/5.6、Claude 5/4.8、Grok 4.5/4.6、DS V4、GLM-5.2/5.3、Gemini 3.7、Kimi K3）钉在 `src/builtin-catalog.ts`。向导启动不拉 models.dev；只有用户勾选了内置没有的 id 才拉官方桶。Claude 一律 1M 上下文。

---

## 1. 项目画像

| 项 | 现状 |
| --- | --- |
| 定位 | Pi 内 TUI 向导：把中转站加成一个 provider，按 API 拉模型，按 models.dev 官方桶填能力，写入 `models.json` |
| 形态 | 规格仓库；`package.json` 已声明 `pi-package`，`src/` 还不存在 |
| 非目标 | 不写自定义 transport / OAuth；不替代 `pi-ccs`；不写价格；首版不管 `auth.json` |
| 用户现状 | `QQ` / `BH` / `ELY` / `WONG` / `Mustore` 全是单 API `openai-completions`，明文 key，部分带 `thinkingFormat: "deepseek"` |

和 Pi 0.84.2 对齐得较好的部分：

- 交付形态是 extension / pi package，不改本体。
- 一个 provider、多 API、模型级 `api` + `baseUrl` 覆盖，和 `provider-composer.modelFromJson` 一致。
- 写盘 + `ctx.modelRegistry.refresh()`，重启仍在。
- 只信官方桶，丢弃转售副本价格 / `reasoning_options`。
- 同 id 冲突显式处理；备份后再写。
- 非 TUI 直接失败。

---

## 2. 同类项目怎么做（实现路径）

GitHub 上没有「给 Pi 写 `models.json` 的中转站向导」。最接近的是下面几条链路，建议当参考，不要当模板照抄。

### 2.1 sst/models.dev —— 能力源

仓库：<https://github.com/sst/models.dev>

三条 API，职责不同：

| URL | 形状 | 用途 |
| --- | --- | --- |
| `https://models.dev/api.json` | provider → `{ models: { id: obj } }`，约 3.8MB / 188 个 provider | 含 `reasoning_options`、`interleaved`、价格、转售副本 |
| `https://models.dev/models.json` | 扁平 `lab/model` → 对象，约 350 条 | **实验室权威身份**；无 `reasoning_options` / `interleaved` |
| `https://models.dev/catalog.json` | 两者合并 | 一次拿齐 |

数据在仓库里是 TOML（`providers/<id>/models/<id>.toml` + `models/<lab>/<id>.toml`），用 `base_model` 继承。生成器明确写了：转售站只覆盖价格 / limit，**思考档位必须抄实验室条目**，不能自己猜。

本机 2026-08-17 拉到的官方桶（key 都存在）：

`openai` `anthropic` `google` `moonshotai` `deepseek` `xai` `zhipuai` `zai` `alibaba` `minimax` `xiaomi`

转售副本（`openrouter` / `nano-gpt` / `ai-router` / `cortecs` / `hpc-ai` / `qiniu-ai` / `*-coding-plan` / `*-token-plan`）对同一模型的 `reasoning_options` **确实会漂**。SPEC 禁止当默认，这条成立。

### 2.2 sst/opencode —— 最近的消费方

`packages/opencode/src/provider/provider.ts`：

```text
models.dev api.json
  → fromModelsDevProvider / fromModelsDevModel
  → 内部 Model（limit / modalities / reasoning / interleaved / cost）
  → 与 opencode.json 用户 provider 合并
  → 按 npm 包选 AI SDK transport
```

值得抄：

- 官方目录是**只读缓存**，用户配置盖在上面。
- `interleaved.field === "reasoning_content"` 直接变成能力，不是注释。
- DeepSeek 走 `@ai-sdk/openai-compatible` 时，缺省补 `reasoning_content`。
- 过期 / 实验模型按 `status` 过滤。

不要抄：

- OpenCode 会把思考档位拆成多个 variant 模型 id。Pi 用一条模型上的 `thinkingLevelMap`，拆 id 会把 `/model` 弄乱。
- OpenCode 按 AI SDK `npm` 选协议；本包必须按用户选的 Pi `api` 写盘。

### 2.3 pi-ccs（本机兄弟包）—— 边界与反面教材

`pi-ccs` 管 CC-Switch **热路由**；本包管用户自己的 `models.json`。SPEC §2 这条不要动。

`docs/REVIEW.md` 里已经验证过的坑，本包必须提前写进规格：

| pi-ccs 教训 | 对本包的含义 |
| --- | --- |
| 夹具全绿、真机主路径不通 | 单测必须用真实 `api.json` 官方对象 + 真实 `/v1/models` 形状 + 本机 ELY/WONG 合并用例 |
| 无 hint 的目录被静默丢弃 | 中转站 `/models` 只有 `{id}` 是正常情况，必须全部可勾选 |
| `validateConfig` 把未知字段（含 key）写回 | 写 `models.json` 只出 schema 白名单字段 |
| 响应先整包进内存再限长 | models.dev 4MB、站目录都要边读边截断 |
| 文档勾完代码没做 | SPEC 验收项必须能在本机 ELY 上手工跑通，PLAN 不要提前打勾 |

### 2.4 其它（只需知道差异）

- **LiteLLM**：运行时代理 / 路由 / 计费，不是配置向导。
- **Continue**：IDE 里填 provider YAML，能力模型很粗。
- **Aider**：本地 model metadata JSON，无 TUI 向导。
- **Pi 官方**：`registerProvider` + `refreshModels` 适合 llama.cpp 这种活目录；本包要持久化，主路径是写 `models.json` 再 `refresh()`。

建议的本包路径（综合上面）：

```text
官方桶索引（api.json 的 lab key，ETag 缓存）
        ↓ 匹配（规范化 id，禁止转售）
远端 GET {baseUrl}/models（按协议试端点，限长 / 超时 / 不跟跨源 3xx）
        ↓ 用户多选
映射 → Pi ModelDefinition（thinkingLevelMap / compat / 无 cost）
        ↓ 与现有 models.json 按 id 合并（先备份、原子写、0600）
ctx.modelRegistry.refresh() → 看 getError() → 失败回滚
```

---

## 3. 对照活数据：SPEC 会写错的地方

2026-08-17 本机 `https://models.dev/api.json` 官方对象（不是转售副本）：

| 官方桶 / id | reasoning_options | interleaved | limit |
| --- | --- | --- | --- |
| `openai/gpt-5.6-sol`（luna/terra 同） | effort `none,low,medium,high,xhigh,max` | 无 | 1050000 / 128000（input 922000） |
| `anthropic/claude-opus-5` | effort `low,medium,high,xhigh,max`（**无 toggle、无 none**） | 无 | 1000000 / 128000 |
| `anthropic/claude-sonnet-5` | **toggle +** effort `low…max` | 无 | 1000000 / 128000 |
| `google/gemini-3.7-flash` | effort `low,medium,high`（**无 off/minimal**） | 无 | 1048576 / 65536 |
| `moonshotai/kimi-k3` | toggle + effort `low,high,max` | `reasoning_content` | 1048576 / 131072 |
| `deepseek/deepseek-v4-flash` | toggle + effort `low,high,max` | `reasoning_content` | 1000000 / 384000 |
| `deepseek/deepseek-v4-pro` | toggle + effort `high,max` | `reasoning_content` | 1000000 / 384000 |
| `xai/grok-4.6` | effort `low,medium,high,xhigh`（**无 max**） | 无 | 500000 / 500000 |
| `zhipuai/glm-5.2`（`zai` 同） | effort `high,max` | `reasoning_content` | 1000000 / 131072 |

官方 `deepseek` 只有：`deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-chat`、`deepseek-reasoner`。  
**没有** `deepseek-v4-flash-0731`。带 `-0731` 的 44 条全是转售副本。

因此：

### F1. 精确匹配表把转售 id 当成官方 id（P0）

SPEC §8.3 例子：`deepseek-v4-flash-0731` 当作官方精确命中。按现在的算法，用户站上的 `deepseek-v4-flash-0731` / `deepseek-ai/deepseek-v4-flash-0731`（WONG 就是这种）会：

1. 去 vendor 前缀 → `deepseek-v4-flash-0731`
2. 官方桶精确匹配失败
3. 模糊命中 44 条转售副本，或掉进启发式

必须在精确匹配前再剥一层**构建后缀**：`-\d{4}$`（`-0731`、`-0813`）、以及已写的 `-think` / `-thinking` / `-reasoner`。写入 id 仍用上游原样。

`glm-5.3` 今天也不在 `zhipuai` / `zai` 官方桶里，只在 `zhipuai-coding-plan` 等副本。启发式可以留，但 UI 必须标 `unmatched`，不能标 `official`。

### F2. 官方桶名单过窄（P1，用户真机会踩）

SPEC 只信：`openai anthropic google moonshotai deepseek xai zhipuai`。

本机用户模型还涉及 Qwen / GLM / Kimi / Grok。缺的实验室 key：

| 应加入 | 原因 |
| --- | --- |
| `zai` | 与 `zhipuai` 同模型、同 `reasoning_options`；部分站打 `zai/` 前缀 |
| `alibaba` | Qwen 官方实验室，不是转售 |
| `minimax` `xiaomi` | 实验室；可后置，但不要和 `*-coding-plan` 混为一谈 |

仍然禁止：`openrouter`、`ai-router`、`nano-gpt`、`hpc-ai`、`qiniu-ai`、`*-token-plan`、`*-coding-plan`、`alibaba-cn` 等一切副本。

匹配顺序建议：先 `openai…zhipuai` 再 `zai` `alibaba` `minimax` `xiaomi`。同 id 两桶都有时（`glm-5.2`）取名单更靠前的，不要取 `last_updated`。

### F3. `thinkingLevelMap` 示例和启发式过时（P0）

SPEC 示例会写出与官方不一致的档位：

| SPEC 现在写的 | 官方实际 |
| --- | --- |
| DeepSeek：只开 `high`+`max` | Flash 是 toggle + `low/high/max` |
| Gemini：`off/minimal/low/medium/high` | 只有 `low/medium/high` |
| Claude：`low+medium+high` | Opus 5 还有 `xhigh/max`，且 **不能 off** |
| 启发式 `grok-4`：无 xhigh | Grok 4.6 有 `xhigh`、无 `max` |
| 启发式 `glm-5`：只藏 off | GLM-5.2 是 `high+max` + deepseek 风格 interleaved |

示例应改成「算法 + 单测夹具」，不要在 SPEC 里写会死的档位表。启发式只在 **完全 unmatched** 时用，且数字从官方桶抄最近家族，而不是手写死。

`none → off` 要写清：Pi **键**是 `off`，发给站的 **值**是 `"none"`（GPT-5.6）。不是把键写成 `none`。

Opus 5 没有 `none` / toggle → 必须 `"off": null`，否则 Pi UI 会画出关不掉或乱送的档。

### F4. 只拉 `api.json` 不够稳（P1）

`models.json`（实验室扁平目录）适合做身份索引：无转售、id 稳定、约 350 条。  
但思考档位和 `interleaved` **只在 `api.json` 官方对象里**。

建议缓存策略：

1. 条件 GET `api.json`（带 `ETag` / `If-None-Match`，models.dev 已返回 etag）。
2. 本地只索引官方桶（体积从 3.8MB 降到很小），完整文件可留作调试。
3. 身份匹配用官方桶 id + `models.json` 的 `lab/slug`（若同时缓存）。
4. 能力字段只读官方桶对象。失败才启发式。

TTL 24h + 强制刷新入口保留。拉失败用过期缓存，这条对。

---

## 4. 对照 Pi 0.84.2 契约

### F5. 没有「密码框」（P1）

`ctx.ui.input(title, placeholder?, opts?)` 的 `opts` 只有 `signal` / `timeout`。  
`@earendil-works/pi-tui` 的 `Input` 也无 mask。

SPEC §6「input apiKey（密码框）」做不到。要自己用 `ctx.ui.custom()` 画掩码输入，或坦白「TUI 里 key 会回显，写盘后终端可滚走」。首版建议自绘掩码，避免 key 留在 scrollback 那么久。

### F6. `registerProvider` 和写盘不要同时当主路径（P0）

组成顺序是：内置 → `models.json` → extension `registerProvider`。  
extension 一旦带 `models`，**整表替换**该 provider 的 extension 层。之后若内存里的 register 和文件不一致，以 extension 为准，文件等于没了。

`/model` 打开会重载 `models.json`。命令里 `await ctx.modelRegistry.refresh()` 就够让新模型出现。

建议改成：

- 主路径：写盘 → `refresh()` → `getError()`。
- `registerProvider` 只用于「确认前预览、不写盘」这种显式模式（首版可不做）。
- 不要对用户已有的 `ELY` 再 `registerProvider`。

### F7. 多 API 时必须先拆掉 provider 级 openai-only compat（P0）

`modelFromJson` 是 `mergeCompat(provider.compat, model.compat)`。用户现在的 ELY/QQ：

```json
"compat": {
  "thinkingFormat": "deepseek",
  "requiresReasoningContentOnAssistantMessages": true
}
```

若只给新 Claude 模型写 `api: anthropic-messages` 而不改 provider 级 compat，Claude 会继承 `thinkingFormat: "deepseek"`。SPEC §9 禁止这件事，但没写**迁移步骤**。

给已有 provider 加非 `openai-*` API 之前，必须：

1. 把 provider 级的 `thinkingFormat` / `requiresReasoningContentOnAssistantMessages` **下沉**到现有 openai 模型；
2. 从 provider 级删掉这两项；
3. 新 API 的模型按自己的 schema 写 compat。

`supportsDeveloperRole: false`、`supportsLongCacheRetention: false` 可以留在 provider 级（中转站通病）。

### F8. 缺 `forceAdaptiveThinking` / `thinkingFormat: "zai"` / `deferredToolsMode`（P1）

Pi 0.84.2 对自定义模型不会自动开这些：

| 条件 | 应写 |
| --- | --- |
| 命中官方 `anthropic` 的 Opus/Sonnet 5 家族，或用户选了 `anthropic-messages` 且 id 像 `claude-*-5` | `compat.forceAdaptiveThinking: true` |
| 命中 `zhipuai` / `zai`，或 interleaved 为 `reasoning_content` 且家族是 glm | 优先 `thinkingFormat: "zai"`，不要一律 deepseek |
| 命中 `moonshotai` 且走 `openai-completions` | 考虑 `deferredToolsMode: "kimi"`（可放高级项，默认先关，避免中转站拒参） |
| DeepSeek + `interleaved.field === "reasoning_content"` | 维持 SPEC：`thinkingFormat: "deepseek"` + `requiresReasoningContentOnAssistantMessages` |

只靠启发式 `claude → low+medium+high`、不写 adaptive，Claude 5 自定义条目会按旧 budget thinking 发，中转站很容易 400。

### F9. provider 级省略 `api`/`baseUrl` 有隐患（P1）

`modelFromJson`：`api` / `baseUrl` 缺省链是模型 → provider → **已有同 id 或 `models[0]`**。  
SPEC 写「provider 级不写死，或只写最常用一条」。若新模型漏写 `api`，会默默继承第一条 DeepSeek 的 `openai-completions`。

硬约束应改成：

- **每个新写入模型必须自带 `api` 和 `baseUrl`。**
- 已有模型若还靠 provider 继承，合并时回填到模型上，再考虑是否保留 provider 缺省。
- 不要在多 API 之后删掉 provider 级字段，除非已回填完毕。

同 id 回退链是脚枪，单测要锁住「漏写 api 必须失败 / 或向导拒保存」。

### F10. schema 不允许私货字段（P0）

`ModelConfig.load` 用 TypeBox `Compile(ModelsConfigSchema)`。模型对象字段是白名单。用户文件现在能过，是因为只用了 schema 里有的键。

向导**不能**往 `models.json` 写 `_hub` / `source` / `matchedFrom` 这类元数据，否则 `refresh()` 整文件报 schema 错，所有 provider 一起消失。

匹配质量、官方 id、缓存时间放到 sidecar：`~/.pi/agent/pim-models.json`（无密钥）。`models.json` 只出 Pi 认识的字段。

`cost`：新模型省略（Pi 默认全 0）。合并时**不得清掉**用户已经手写的 cost。

### F11. 非 TUI 判断要用 `ctx.mode === "tui"`（P2）

`ctx.hasUI` 在 RPC 下也是 true，但 `custom()` 能力不同。SPEC 写 print/json 失败是对的，判断条件写成 `mode !== "tui"`。

### F12. `openai-codex-responses` 首版可以留在列表，不要当默认

`docs/models.md` 的 Supported APIs 表没列它，`custom-provider.md` 和 `modelFromJson` 的 `api` 字符串可以。中转站极少走 Codex Responses。默认仍是 `openai-completions`。

### F13. 写盘权限与备份名（P1）

本机 `auth.json` 是 `0600`，`models.json` 是 `0644` 且含明文 key。向导写入（含 `.bak-*`）应 `0o600`。

现有备份两种风格：`models.json.bak-20260817-114743-full` 与 `models.json.bak.20260803-100612`。新备份用 `models.json.bak-YYYYMMDD-HHMMSS`，只保留最近 N 份（建议 10），避免 key 副本无限涨。

写盘：同目录 tmp + `rename`。失败则 `refresh()` 后 `getError()`，提示备份路径并提供回滚。

---

## 5. 向导流程缺口

### F14. 「已有 API」无法从 `models.json` 无损还原（P1）

`models.json` 没有 `apis[]`。再次打开「给 ELY 加 API / 替换该 API 下模型」只能靠模型上的 `(api, canonicalBaseUrl)` 分组。

SPEC 要写清：

- 规范化 URL 后再比（去末尾 `/`、openai 的 `/v1` 语义）。
- 「替换该 API」= 删掉该 `(api, baseUrl)` 分组再写入新勾选，其它分组不动。
- sidecar 可记住上次拉过的 URL，但不作为唯一真相。

### F15. 多选组件不是 SettingsList（P1）

`SettingsList` 是改某一项的枚举值。`ctx.ui.select` 单选。站目录经常 50–200 个 id。

需要自绘：过滤、空格勾选、全选可见项、官方命中置顶、embedding/tts/image/video 默认折叠。参考 `examples/extensions/questionnaire.ts` 的 custom UI，不要复用 SettingsList。

### F16. 目录端点变体少了（P1）

除 OpenAI `{ data: [{id}] }` 外，真实会遇到：

| 协议 | 常见形状 |
| --- | --- |
| 多数 New API | `{ data: [{ id, object, owned_by }] }` |
| 部分网关 | `{ models: ["a","b"] }` 或 `{ models: [{id}] }` |
| Anthropic 官方 | `{ data: [{ id, display_name, created_at }] }`，路径 `/v1/models` |
| Gemini 官方 | `{ models: [{ name: "models/gemini-..." }] }`，要剥 `models/` |

Gemini / Claude 在中转站上**更常走 openai-completions**，而不是原生协议。向导文案应提示：「只有站点提供原生 Claude/Gemini 端点时才选对应 api；否则选 openai-completions，模型 id 仍按官方桶匹配。」

拉目录：超时、`AbortSignal`、拒绝 URL userinfo、不跟随跨 origin 3xx、body 上限（建议 2MB）、非 2xx 只展示 status + 截断 body。HTML 首页提示补 `/v1`，不要自动改用户输入后重试写盘。

### F17. 模糊匹配「取 last_updated 最新」会误配（P0）

`gpt-5` 会 contains 命中 `gpt-5`、`gpt-5.5`、`gpt-5.6-sol`、`gpt-5-nano`、`gpt-5.3-codex`。取最新几乎一定是错的。

建议打分，分差不够则标 `~ fuzzy` 让用户挑，不要自动定：

1. 规范化后精确（官方桶）
2. 去构建后缀后精确（`-0731`、`-think`）
3. 官方 id 是规范化 id 的前缀 / 后缀，且长度差 ≤ 2 个 token
4. 同 `family` + 高 token 重叠
5. 否则 unmatched

禁止用 contains 命中 embedding / tts / realtime / image / video / `gpt-image` / `whisper`。

WONG 的 `deepseek-ai/deepseek-v4-flash-0731` 走 1→去前缀→去 `-0731`→命中官方 `deepseek-v4-flash`，标 `✓ official`。

### F18. 能力编辑默认 skip 很好；reset 需要对照物（P2）

没有 sidecar 就无法区分「用户改过」和「上次向导写的」。reset = 用**当前缓存**按写入 id 重新匹配并覆盖能力字段，不动 `id` / `api` / `baseUrl` / 用户 cost。SPEC 这样写即可，不要假装能还原到「用户第一次保存时的官方值」。

### F19. 首版范围：多 API 是硬需求（已修订）

用户明确要求首版就是「1 个 provider、多条 API」。单 API 闭环只是实现顺序里的第一步，**不能**当发布门槛。v0.1 必须包含：

1. 新建时循环添加多条 API，每条各自拉模型、多选。
2. 给已有 provider 再挂一条不同协议的 API（含 §9.1 compat 下沉）。
3. 同 id 冲突显式处理（不改写入 id）。

能力编辑屏仍可后置（默认可 skip），但不能再把验收 2 推到 v0.2。

---

## 6. 安全与可靠性（写进 SPEC §13）

1. **明文 key**：与现状一致。写入 `0600`；日志 / notify / 错误截断不得含 `sk-` / `Authorization`。
2. **备份即密钥副本**：备份同样 `0600`，轮转。
3. **不把 key 写入 sidecar / 缓存 / models.dev 缓存。**
4. **URL**：拒 userinfo；剥 hash/query；自动发现若以后做，非用户输入的非 loopback fail-closed（现规格没有自动发现，保持这样）。
5. **schema 失败回滚**，不要留半截文件。
6. **`$ENV` / `!command`**：Pi 已支持。首版可在确认屏加一项「写成 `$FOO` 而不是字面量」，默认仍字面量（符合用户习惯）。不要做「读当前环境反写」。
7. **Provider 名**：限制 `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`，避免空格、中文、和内置 id（`openai`/`anthropic`/`google`/`cc-switch-*`）撞车。撞内置名必须二次确认：那是「覆盖内置 provider」，不是「新建中转站」。

---

## 7. 包与工程

SPEC §11 结构可用，建议补：

```text
package.json
  type: module
  keywords: ["pi-package"]
  peerDependencies: {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
  engines 注释：对着 Pi >= 0.84.2，不要发明 engines.pi（npm 不认）
src/           按 SPEC，另加：
  fetch.ts     限长 / 超时 / ETag
  match.ts     从 models-dev.ts 拆出纯函数，便于单测
  sidecar.ts   hub-models.json
tests/fixtures/
  models.dev-official.snippet.json   从 api.json 裁官方桶
  catalog-openai.json
  catalog-anthropic.json
  models.json-ely-before.json
```

开发期：`~/.pi/agent/extensions/pi-models/` 或 `pi --extension`。  
发布名不要叫光秃的 `pi-models` 除非确认 npm 没人占（`pi-ccs` 已被占过）。

测试最低集（没有这些不要标完成）：

- 官方桶：GPT-5.6 / Opus 5 / Sonnet 5 / Gemini 3.7 / Kimi K3 / DS V4 Flash / GLM-5.2 / Grok 4.6 的 map
- `-0731`、`deepseek-ai/`、`GLM-5.2-think`、`DeepSeek-V4-Flash-think`
- 转售桶不得赢过官方
- ELY 已有模型合并、同 id 冲突、加第二条 API 时 compat 下沉
- 非法 schema 字段不写盘
- URL 规范化 + HTML 首页
- 非 tui 不写盘

---

## 8. 建议对 SPEC 的最小修订清单

按优先级改 `docs/SPEC.md`，不必扩写成长文：

1. §8.2 官方桶加上 `zai`、`alibaba`；写明禁止 `*-plan` / 转售。
2. §8.3 匹配步骤插入「去 `-\d{4}$` 构建后缀」；删掉把 `deepseek-v4-flash-0731` 当官方精确 id 的例子。
3. §8.3 模糊匹配改为打分，禁止 “contains + last_updated 最新”。
4. §8.4 用算法描述 `reasoning_options` → `thinkingLevelMap`，示例改成 GPT-5.6（`off:"none"`）和 Opus 5（`off:null` + xhigh/max）。
5. §8.5 启发式改为「抄最近官方家族」，表作为附录且标注日期。
6. §5.2 / §9 增加「加非 openai API 前下沉 provider 级 thinkingFormat」；每个新模型强制自带 `api`+`baseUrl`。
7. §9 增加 Claude 5 `forceAdaptiveThinking`、GLM `thinkingFormat: "zai"`。
8. §4 / §6 主路径改为只写盘 + `refresh()` + `getError()`；删掉「密码框」，改为自绘掩码。
9. 新增 sidecar 约定；明确 `models.json` 白名单字段。
10. §7 补目录 JSON 变体、限长、不跟跨源重定向。
11. §13 补 `0600`、备份轮转、禁止撞 `cc-switch-*` / 内置 provider。
12. §14 / §15 把多 API 与能力编辑标成 v0.2；v0.1 验收只留单 API 闭环。

---

## 9. 建议实现顺序（替换 SPEC §15）

**v0.1**

1. `fetch.ts` + `models-dev.ts` + `match.ts` + 官方夹具单测（含 F1/F3/F17）。
2. `models-json.ts`：备份、0600、原子写、按 id 合并、白名单字段、冲突；ELY 夹具。
3. `catalog.ts`：openai `/models` + URL 规范化。
4. `/pim-models`：新建 / 合并已有，单条 `openai-completions`，过滤多选，skip 编辑，refresh。
5. 打成可 `pi --extension` 的包。

**v0.2**

6. 多 API 循环 + compat 下沉 + 冲突 UI。
7. 能力编辑 + reset + sidecar。
8. Anthropic / Gemini 目录变体与手输 id。

---

## 10. 审查方法

读过：

- 本仓库 `docs/SPEC.md`、`README.md`、`package.json`
- Pi 0.84.2：`docs/models.md`、`docs/providers.md`、`docs/packages.md`、`docs/extensions.md`（UI / registerProvider / refresh）、`docs/tui.md`、`docs/custom-provider.md`、`docs/security.md`
- `dist/core/provider-composer.js`（`modelFromJson` / `applyModelsJson` / `applyExtension`）
- `dist/core/model-config.js`（schema / `refresh` 失败形态）
- `dist/core/extensions/types.d.ts`（`input` 无 secret）
- 本机 `~/.pi/agent/models.json`（QQ/BH/ELY/WONG/Mustore）
- `pi-ccs` 的 SPEC / REVIEW / `src/models.js` / README
- models.dev README；本机下载的 `api.json`（188 providers）
- OpenCode `provider.ts` 中 `fromModelsDevModel` / `fromModelsDevProvider`

独立核对：

- 官方桶 key 存在且 `deepseek` 无 `-0731`
- GPT / Claude / Gemini / Kimi / DS / GLM / Grok 的 `reasoning_options` 与 SPEC 示例不一致
- `ctx.ui.input` 无密码选项
- `registerProvider({models})` 会替换 extension 层
- 本机 `models.json` 0644 vs `auth.json` 0600
