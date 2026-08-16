# AI 工作复盘与 Codex CLI 接入设计方案

> **已被替代：** 本文记录旧版“一键 AI 工作复盘”方案。新的产品与实施基线见 [`ai-companion-mcp-design.md`](ai-companion-mcp-design.md)。历史 `ai_review_runs` 数据继续保留，但旧入口不再扩展。

> 文档状态：产品、架构与安全边界已收敛；网页端只读 AI 复盘已完成，变更提案与 Codex MCP 待实现
>
> 最后更新：2026-08-16
>
> 前置功能：任务与子任务、按日期完成目标、任务级完成评价、今日复盘、工作复盘
>
> 目标用户：当前个人使用，并按未来多用户场景设计

## 0. 实现进度

截至 2026-08-16，已完成第一条可部署的网页端纵向链路：

- 工作复盘结论从 Local Storage 迁移为 Supabase 云端数据，并保留手动保存时的旧数据迁移路径；
- 设置页支持 AI 服务 Base URL、模型和 API Key 的验证、保存、状态查询和删除；
- 模型服务 Base URL 由部署者通过 `OPENAI_BASE_URL` 配置，可使用官方 OpenAI API 或兼容 `/models`、`/responses` 与结构化输出的 HTTPS 中转站；
- 每个用户可以在网页设置中覆盖 Base URL 和模型；服务端仍会拒绝非 HTTPS、内网地址和不符合部署白名单的目标；
- Edge Function 在服务端按当前时间范围构建 `ReviewContext`，限制数据量并移除无关字段；
- AI 结果以结构化格式保存，页面展示摘要、重要产出、阻塞、建议、分析边界和证据回跳；
- 数据表、RLS、频率限制、同用户并发限制、来源白名单和运行记录已经落地。

尚未实现的部分是任务变更提案的确认执行，以及 Codex CLI 使用的 TodoList MCP。后续阶段继续复用本文定义的数据契约和安全边界。

## 1. 结论

本项目建议采用“网页主入口 + Codex CLI 高级入口”的双入口方案，但两者不直接互相调用：

```text
TodoList 数据与操作协议
├─ 网页 AI 工作复盘
│  └─ 用户自己的 OpenAI API Key -> 服务端代理 -> 模型分析
└─ Codex CLI
   └─ Codex 自身登录 -> TodoList MCP -> 读取数据 / 保存变更提案
```

两种入口共享同一份工作复盘上下文和变更提案格式：

```text
任务、目标、评价、每日复盘
        ↓
标准化 ReviewContext
        ↓
AI 分析与建议
        ↓
结构化 ChangeProposal
        ↓
网页逐项确认
        ↓
TodoList 执行允许的变更
```

第一版的核心能力是 **AI 最近 7 天工作复盘**，不是通用聊天机器人。它回答：

1. 最近实际完成和推进了什么；
2. 哪些阻塞、计划偏差或未收口事项值得关注；
3. 下一阶段最重要的调整是什么；
4. 哪些任务适合改期、拆分或补充完成目标。

AI 不直接修改任务。网页和 CLI 生成的所有任务变更都先保存为提案，用户在网页查看前后差异并确认后才执行。

## 2. 为什么采用这个方向

### 2.1 现有数据已经适合做证据型分析

当前项目并非简单的勾选清单，已有以下分析依据：

| 数据 | 能提供的事实 |
| --- | --- |
| `todos` | 当前任务状态、层级、安排日期、完成时间和描述 |
| `todo_completion_goals` | 用户在某天原本希望达到的结果 |
| `todo_completion_reviews` | 某个任务当天实际达成、部分达成或未推进的结果 |
| `daily_reviews` | 计划外事务、探索、阻塞和次日调整等日级上下文 |
| 工作复盘派生数据 | 最近 7 天的完成记录、未收口事项和日期时间线 |

`js/main.js` 已实现 `getRecentReviewEvidence()`、`getRecentReviewOpenItems()` 和工作复盘页面。AI 应复用这套事实口径，不重新发明“工作量”或把当前计划误写成历史事实。

### 2.2 网页不能以 Codex CLI 作为运行时

Codex CLI 是本机终端工具，网页无法可靠、安全地启动用户电脑上的 CLI，也不能假设线上用户安装了 Codex。因此网页端应通过服务端模型 API 提供 AI 能力。

Codex CLI 适合通过 MCP 访问 TodoList。MCP 可以向 Codex 暴露结构化工具和实时私有数据，正好承担“读取复盘上下文”和“提交候选变更”的职责。

### 2.3 网页与 CLI 不应重复调用模型

- 网页入口由 TodoList 后端调用模型，因此需要用户提供 OpenAI API Key；
- Codex CLI 已有自己的登录和模型会话，MCP 不再调用模型，也不读取 Codex 凭据；
- 两边只复用数据契约、建议格式和服务端校验规则。

这样既避免重复费用，也不会把网页 API Key、Codex 登录信息和 TodoList 数据权限混在一起。

## 3. 产品范围

### 3.1 第一版包含

- 在“工作复盘”页面生成最近 7 天的 AI 分析；
- 展示关键产出、阻塞与偏差、未收口风险和下一步建议；
- 每条判断可以引用对应日期、任务或评价作为证据；
- AI 可以提出有限的结构化任务变更；
- 用户可以逐项选择、预览并确认执行；
- 在设置中配置、验证和删除自己的 OpenAI API Key；
- Codex CLI 通过 TodoList MCP 读取相同上下文；
- Codex 可以把建议保存为待确认提案，随后在网页确认执行；
- 保存分析历史、提案状态和执行结果，支持跨设备查看。

### 3.2 第一版允许的任务变更

| 操作 | 用途 | 约束 |
| --- | --- | --- |
| `reschedule_task` | 调整未完成任务的计划日期 | 只能设置为今天或未来日期 |
| `create_task` | 把明确的下一步新增为父任务 | 标题必填，可选分组和计划日期 |
| `create_subtask` | 把现有任务拆成可执行步骤 | 父任务必须存在且属于当前用户 |
| `set_completion_goal` | 为任务补充某日完成目标 | 日期不得早于今天，正文 1～500 字符 |

第一版不允许 AI 删除任务、标记完成、重新打开任务、修改用户原始复盘、删除分组或批量覆盖任务正文。这些操作的事实含义和误操作成本更高，暂不进入 AI 写入白名单。

### 3.3 第一版不包含

- 不做悬浮式通用 AI 聊天窗口；
- 不做自动执行和无人值守改任务；
- 不根据没有记录的日期推断“没有工作”或“效率低”；
- 不估算工时、绩效或生产力分数；
- 不把 API Key 写入前端代码、Local Storage、日志或模型上下文；
- 不接入外部日历、邮件、即时通信和代码仓库；
- 不在第一版支持多个模型供应商或复杂模型选择器；
- 不让 Codex MCP 第一版直接执行任务变更。

## 4. 网页体验

### 4.1 入口

在现有“工作复盘”页面头部增加 `AI 分析` 命令按钮。没有配置 Key 时，按钮打开 AI 设置面板；配置完成后进入生成确认。

生成前显示本次会发送的数据摘要：

```text
分析范围：最近 7 天 · 8月10日 - 8月16日
包含：5 条每日复盘、9 条任务评价、6 条完成记录、4 个未收口事项
模型服务：OpenAI · 使用你的 API Key

[取消] [生成分析]
```

用户可以看到数据范围和类型，但无需阅读完整请求正文。界面同时说明数据将发送给所选模型服务处理。

### 4.2 结果结构

AI 结果显示在工作复盘页面的现有事实时间线之后、人工“复盘结论”之前：

```text
AI 工作复盘
├─ 总结
├─ 重要产出
├─ 阻塞与偏差
├─ 下一步建议
└─ 待确认调整
```

展示要求：

- 总结控制在 150～300 个中文字符；
- 重要产出、阻塞和建议各最多 5 条；
- 每条结论至少包含一个证据引用，或明确标注“基于有限记录的推断”；
- 证据引用可点击，跳转到对应日期复盘或任务；
- AI 不使用“你没有工作”“效率很低”等超出证据的判断；
- 没有足够数据时给出补充记录建议，不强行生成确定结论。

### 4.3 任务变更确认

AI 返回的候选变更以可勾选列表展示：

```text
☑ 将“接口联调”从 8月15日调整到 8月17日
  原因：连续两天评价为部分达成，并存在前置依赖

☑ 在“接口联调”下新增子任务“确认测试账号权限”
  原因：8月16日复盘明确记录此阻塞

☐ 为“移动端检查”设置 8月17日完成目标
```

用户点击“应用所选调整”后，再显示一次前后差异。服务端逐项验证后执行，并返回：

- `applied`：执行成功；
- `conflict`：任务在提案后已被修改，未覆盖新数据；
- `invalid`：目标已删除、已完成或不再满足约束；
- `failed`：服务端错误，可单项重试。

批量应用允许部分成功，界面必须逐项显示结果，不把部分成功包装成整体成功。

### 4.4 分析历史

- 工作复盘默认显示当前日期范围最近一次成功分析；
- 用户可以重新生成，新结果创建新版本，不覆盖旧记录；
- 历史记录显示生成时间、模型标识、分析范围和提案状态；
- 用户可以删除自己的分析记录；删除分析不撤销已经执行的任务变更；
- 分析保存时不保存 API Key，也不保存供应商返回的内部推理内容。

## 5. 总体架构

```text
GitHub Pages / Vanilla JS
        │ Supabase session JWT
        ▼
Supabase Edge Functions
├─ ai-credential   保存、验证、删除加密后的用户 Key
├─ ai-review       组装上下文、调用模型、校验结果、保存分析
├─ ai-proposal     读取提案、应用已确认的提案项
└─ integration-token  创建、列出、撤销 MCP 访问令牌
        │
        ├──────────────► OpenAI API
        │                 只接收 AI 分析上下文
        ▼
Supabase PostgreSQL
├─ 现有任务、目标、评价、每日复盘
├─ work_reviews
├─ ai_provider_credentials
├─ ai_review_runs
├─ ai_change_proposals / ai_change_proposal_items
└─ integration_tokens

Codex CLI
        │ Streamable HTTP MCP + Bearer Token
        ▼
TodoList MCP Service
├─ 读取标准化复盘上下文
└─ 保存待确认变更提案
        │
        └──────────────► Supabase PostgreSQL / 受控服务接口
```

### 5.1 服务边界

前端只负责交互，不直接访问以下内容：

- OpenAI API；
- 加密后的 API Key 表；
- MCP 集成令牌明文；
- 提案执行用的高权限数据库操作。

Edge Function 必须先验证 Supabase 会话 JWT，再以 `user_id` 作为所有查询和写入的强制范围。Service Role Key 只保存在服务端运行环境。

MCP Service 是独立的 TypeScript 服务，提供稳定 HTTPS Streamable HTTP 端点。第一版使用 TodoList 个人访问令牌作为 Bearer Token；后续可以升级为 OAuth，但工具契约保持不变。

## 6. 标准化分析上下文

网页模型调用和 MCP 的读取工具共用 `ReviewContextV1`。上下文由服务端根据数据库事实组装，前端不能提交任意任务内容冒充数据库记录。

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-16T10:00:00Z",
  "timezone": "Asia/Shanghai",
  "locale": "zh-CN",
  "range": {
    "start_date": "2026-08-10",
    "end_date": "2026-08-16"
  },
  "summary_counts": {
    "recorded_days": 5,
    "completed_records": 6,
    "completion_reviews": 9,
    "open_items": 4,
    "omitted_items": 0
  },
  "days": [],
  "open_items": [],
  "upcoming_items": [],
  "human_conclusion": null,
  "limitations": []
}
```

### 6.1 数据口径

- `days` 沿用现有 `getRecentReviewEvidence()` 的事实分类；
- `open_items` 沿用 `getRecentReviewOpenItems()` 的未收口口径；
- `upcoming_items` 只包含今天之后 7 天内的未完成任务，用于下一步建议；
- `human_conclusion` 来自当前日期范围的人工复盘结论；
- 任务当前安排日期只能作为计划上下文，不能被描述为历史完成事实；
- 已删除任务不会被补写为历史记录，`limitations` 要说明这一数据限制。

### 6.2 数据裁剪

默认范围固定为最近 7 个本地日历日。服务端同时执行以下限制：

- 单次分析日期范围最多 31 天；
- 最多发送 200 条任务级证据；
- 标准化 JSON 序列化后最多 80,000 个字符；
- 超限时优先保留每日复盘、任务评价、未收口事项、完成记录、未来任务；
- 被裁剪的数量写入 `summary_counts.omitted_items` 和 `limitations`；
- 描述字段仅对范围内有证据或属于未收口事项的任务发送。

## 7. AI 输出与提案契约

模型必须返回经过 JSON Schema 约束的 `AIReviewResultV1`。服务端校验失败时最多重试一次；仍不合法则返回可重试错误，不把未校验文本保存为正式分析。

```json
{
  "schema_version": "1.0",
  "summary": "最近 7 天的主要进展是……",
  "highlights": [
    {
      "title": "完成移动端主要布局",
      "detail": "……",
      "evidence_refs": ["todo:uuid", "daily_review:2026-08-14"]
    }
  ],
  "blockers": [],
  "recommendations": [],
  "proposed_changes": [],
  "limitations": []
}
```

每个 `proposed_changes` 项包含：

```json
{
  "client_id": "change-1",
  "operation": "reschedule_task",
  "target_todo_id": "uuid",
  "expected_updated_at": "2026-08-16T08:30:00Z",
  "payload": {
    "planned_date": "2026-08-17"
  },
  "reason": "连续两天部分达成，且复盘记录了前置依赖",
  "evidence_refs": ["completion_review:uuid", "daily_review:2026-08-16"]
}
```

服务端必须拒绝：

- 不在白名单中的 `operation`；
- 不属于当前用户的 ID；
- 模型输入中不存在的证据引用；
- 已完成任务的改期；
- 过去日期、空标题、超长字段和非法父子关系；
- 与当前 `updated_at` 不一致的覆盖性更新；
- 单次超过 10 个候选变更的结果。

提示词只负责要求模型遵守规则，服务端 JSON Schema、所有权检查和操作白名单才是最终安全边界。

## 8. 数据库设计

### 8.1 人工复盘结论云端化

当前工作复盘结论保存在 Local Storage。AI 上线前应按照现有 `docs/recent-work-review-design.md` 的建议增加 `work_reviews` 表，并把结论改为 Supabase 持久化，否则网页、CLI 和不同设备看到的上下文不一致。

表的核心约束：

- `(user_id, range_start, range_end)` 唯一；
- 正文去除首尾空白后为 1～3000 字符；
- `range_start <= range_end`；
- RLS 只允许用户访问自己的记录。

不自动迁移浏览器中已有的 Local Storage 内容。首次打开新版本时，如果本机存在当前范围旧结论且云端为空，提示用户确认导入，避免静默上传本地内容。

### 8.2 `ai_provider_credentials`

用途：保存用户选择的 AI 兼容服务地址、模型和 API Key。

| 字段 | 说明 |
| --- | --- |
| `id`, `user_id` | 一名用户、一个供应商一条记录 |
| `provider` | 第一版固定为 `openai` |
| `base_url` | 用户选择的 HTTPS 模型服务根地址，必须支持 `/models` 和 `/responses` |
| `model` | 用户选择的模型标识 |
| `encrypted_secret` | AES-256-GCM 加密后的密文与认证标签 |
| `iv` | 每次加密随机生成的初始化向量 |
| `key_version` | 服务端主密钥版本，用于轮换 |
| `key_hint` | 只显示末 4 位，不参与鉴权 |
| `last_verified_at` | 最近一次验证成功时间 |
| `created_at`, `updated_at` | 审计时间 |

该表不向 `authenticated` 或 `anon` 角色授予直接访问权限，只允许 Edge Function 的受控服务逻辑访问。加密使用服务端环境中的主密钥，并把 `user_id + provider` 作为附加认证数据，防止密文被跨用户替换。

### 8.3 `ai_review_runs`

保存每次分析的可见结果和元数据：

- 用户、日期范围、状态；
- `context_hash` 和上下文统计，不保存完整原始提示词副本；
- `prompt_version`、供应商和实际模型标识；
- 校验后的结构化输出；
- 供应商返回的输入/输出用量；
- 可公开给用户的错误码；
- 创建、完成和删除时间。

不保存 API Key、模型内部推理、HTTP Authorization 头或供应商原始错误正文。

### 8.4 变更提案

`ai_change_proposals` 保存提案级状态：

- `source`：`web_ai` 或 `codex_mcp`；
- 关联的 `ai_review_run_id`，Codex 来源时允许为空；
- `pending / partially_applied / applied / rejected / expired`；
- 默认 7 天过期；
- 创建时间和最终处理时间。

`ai_change_proposal_items` 保存每一项候选变更：

- 操作、目标任务、预期 `updated_at`、结构化 payload；
- 原因和证据引用；
- `pending / applied / conflict / invalid / failed / rejected`；
- 幂等键、应用时间和安全错误码。

用户确认时只提交提案项 ID。服务端从数据库读取已校验 payload，不能接受前端在确认请求中替换操作内容。

### 8.5 `integration_tokens`

用于 Codex MCP Bearer Token：

- 明文令牌仅创建时显示一次；
- 数据库只保存带服务端 pepper 的哈希；
- 令牌前缀使用 `tdl_`，便于识别和脱敏；
- 支持 `review:read`、`proposal:write` 两种第一版权限；
- 默认 90 天过期，可随时撤销；
- 保存名称、最近使用时间、到期时间和撤销时间；
- 第一版不授予 `task:write`，因此 MCP 无法直接修改任务。

## 9. API Key 与隐私安全

### 9.1 Key 设置流程

1. 用户在“设置 -> AI 服务”输入 Base URL、模型和 API Key；
2. 前端通过 TLS 把配置发送给 `ai-credential` Edge Function；
3. Function 使用一个最小请求验证 Key；
4. 验证成功后使用服务端主密钥加密并保存；
5. 前端只收到 `configured`、末 4 位和验证时间；
6. 后续生成分析时由 Function 解密并调用用户选择的模型服务，Key 不返回浏览器。

如果用户不选择“记住”，Key 只在本次生成请求中传到 Edge Function，函数使用后立即丢弃，不写数据库。前端仅保存在页面内存中，刷新后失效。

### 9.2 必须执行的安全规则

- CSP 限制脚本和网络来源，逐步移除不必要的第三方运行时代码；
- 所有 Edge Function 验证 Supabase JWT、用户状态和请求来源；
- 用户提供的 Base URL 只允许公开 HTTPS 地址，拒绝内网 IP、本机域名、URL 凭据和查询参数，并支持部署域名白名单；
- 修改 Base URL 时必须重新输入 API Key，服务端不得把已保存的 Key 转发到新地址；
- API Key、Service Role Key、集成令牌不得进入日志、异常追踪和模型输入；
- 每用户限制并发分析为 1，默认每小时最多 10 次；
- 生成接口设置超时、响应大小上限和结构化输出校验；
- 模型无法直接获得数据库工具或 Service Role 权限；
- 提案执行不接受模型生成的 SQL、URL、脚本或任意字段路径；
- 用户可以删除 Key、分析历史和未执行提案；
- 设置页明确说明使用用户自己的 API 账户计费和数据处理规则。

仅靠前端隐藏字段或提示词不能保护 Key，也不能阻止越权操作。

## 10. Codex CLI 与 MCP

### 10.1 MCP 工具

第一版远程 MCP 暴露以下工具：

| 工具 | 属性 | 行为 |
| --- | --- | --- |
| `get_work_review_context` | 只读 | 返回 `ReviewContextV1`，默认最近 7 天 |
| `list_tasks` | 只读 | 按状态、分组和计划日期查询有限任务集合 |
| `get_task` | 只读 | 读取单个父任务或子任务及相关目标、评价 |
| `create_change_proposal` | 写提案、不改任务 | 校验并保存最多 10 个候选调整 |
| `get_change_proposal` | 只读 | 返回提案内容、状态和网页确认地址 |

`create_change_proposal` 虽然不会修改任务，也会留下用户数据，因此在 MCP 元数据中标记为非只读操作。

第一版不提供 `apply_change_proposal` MCP 工具。Codex 创建提案后返回网页链接，用户必须在 TodoList 网页完成最终确认。这样确认规则由服务端和产品界面强制执行，不依赖用户是否修改了 Codex 本地审批配置。

### 10.2 Codex 配置

用户在 TodoList 设置中创建集成令牌，并通过环境变量提供给 Codex。项目级 `.codex/config.toml` 可以配置：

```toml
[mcp_servers.todolist]
url = "https://api.example.com/mcp"
bearer_token_env_var = "TODOLIST_MCP_TOKEN"
default_tools_approval_mode = "writes"
```

真实服务地址在部署时替换。令牌只放在用户本机环境或系统密钥管理中，不提交到仓库和 `.codex/config.toml`。

典型交互：

```text
用户：分析我最近 7 天做了什么，找出主要阻塞，并安排明天。

Codex：
1. 调用 get_work_review_context
2. 根据证据生成总结与建议
3. 用户要求把建议变成任务调整
4. 调用 create_change_proposal
5. 返回提案摘要和 TodoList 网页确认链接
6. 用户在网页逐项确认并执行
```

### 10.3 MCP 安全边界

- MCP Service 只接受 HTTPS；
- 每次调用验证令牌哈希、权限、到期和撤销状态；
- 所有数据库查询强制绑定令牌所属 `user_id`；
- 工具返回的数据量遵守与网页相同的裁剪规则；
- 工具不返回 API Key、邮箱、认证 token 和不相关账号资料；
- MCP instructions 明确事实口径、可用工具、速率限制和变更确认规则；
- 日志只记录工具名、用户内部 ID、状态、耗时和结果数量。

未来加入 MCP 直接应用提案时，仍需保留两阶段提案，并增加独立的用户确认凭证，不能只信任模型传来的“用户已确认”字符串。

## 11. 服务端处理流程

### 11.1 网页生成 AI 复盘

```text
验证 Supabase JWT
  -> 验证日期范围和速率限制
  -> 读取并解密用户 Key
  -> 通过 RLS 查询用户数据
  -> 构建、裁剪 ReviewContextV1
  -> 创建 ai_review_runs(pending)
  -> 调用模型并请求结构化输出
  -> JSON Schema 校验
  -> 证据引用与操作白名单校验
  -> 保存分析和提案
  -> 返回可展示结果
```

### 11.2 应用网页确认的提案

```text
验证 Supabase JWT
  -> 读取属于当前用户的 pending 提案项
  -> 再次执行所有权与字段校验
  -> 对更新操作检查 expected_updated_at
  -> 使用幂等键逐项执行
  -> 保存每项结果
  -> 汇总提案状态
  -> 触发现有 Realtime 刷新
```

创建任务和子任务时预先为每个提案项生成稳定 UUID；重复提交同一个已执行项直接返回原执行结果，不创建重复任务。

## 12. 错误与边界处理

| 场景 | 用户体验 | 服务端处理 |
| --- | --- | --- |
| Key 无效或被撤销 | 提示重新配置，不显示供应商原始响应 | 标记 `invalid_api_key`，不重试 |
| 额度不足或限流 | 告知检查 API 账户，可稍后重试 | 使用稳定错误码，遵守退避信息 |
| 模型超时 | 保留页面数据，可重新生成 | 请求终止，run 标记 `timeout` |
| 返回 JSON 不合法 | 提示生成失败，可重试 | 最多修复重试一次，不保存非结构化正文 |
| 没有足够记录 | 显示轻量建议，不编造结论 | 正常成功，输出 limitations |
| 上下文被裁剪 | 显示“部分记录未纳入” | 保存裁剪计数和原因 |
| 任务在确认前被修改 | 单项显示冲突 | `updated_at` 不匹配时不覆盖 |
| 提案过期 | 需要重新生成或复制为新提案 | 7 天后拒绝执行 |
| MCP 令牌撤销或过期 | Codex 工具返回重新授权提示 | 返回 401，不泄露用户是否存在 |
| 部分提案执行失败 | 成功项保留，失败项可重试 | 逐项幂等并记录状态 |

## 13. 实施阶段

### 阶段一：统一数据基础

- 将工作复盘结论从 Local Storage 迁移到 `work_reviews`；
- 提取服务端 `ReviewContextV1` 构建与裁剪逻辑；
- 增加 AI、提案和集成令牌表及 RLS/权限；
- 建立错误码、JSON Schema 和操作白名单。

完成标准：同一用户在网页和服务端看到一致的最近 7 天事实数据，不同用户的数据无法互相读取。

### 阶段二：网页只读 AI 复盘

- 实现 API Key 设置、验证、加密保存和删除；
- 实现 `ai-review` Edge Function；
- 在工作复盘页展示分析、证据引用、加载和错误状态；
- 保存并展示分析历史。

完成标准：AI 只能输出分析和建议，不能产生任何任务数据写入。

### 阶段三：确认后执行

- 启用四种白名单提案操作；
- 实现变更预览、逐项选择、二次确认和执行结果；
- 加入乐观并发、幂等、过期和部分失败处理。

完成标准：没有用户确认时任务数据零变化；发生并发修改时不会覆盖较新的任务状态。

### 阶段四：Codex MCP

- 部署 TypeScript Streamable HTTP MCP Service；
- 实现集成令牌创建和撤销；
- 提供三个只读工具和两个提案工具；
- 补充 Codex 配置文档和网页提案跳转。

完成标准：Codex 可以完成“读取最近 7 天 -> 分析 -> 保存提案”，但不能绕过网页直接修改任务。

## 14. 测试方案

### 14.1 单元测试

- 本地日期与时区边界，尤其是跨日、跨月和夏令时地区；
- 最近 7 天证据分类与当前前端逻辑一致；
- 上下文优先级裁剪和 `omitted_items` 统计；
- AI 输出 JSON Schema、证据引用和操作白名单校验；
- 每种提案 payload 的长度、日期、父子关系和状态校验；
- API Key 加解密、错误密钥版本和密文篡改；
- 集成令牌哈希、权限、到期和撤销。

### 14.2 安全与集成测试

- 使用两个 Supabase 用户验证所有表、Edge Function 和 MCP 的数据隔离；
- 用用户 A 的提案 ID、任务 ID 或分析 ID 请求用户 B，必须统一拒绝；
- API Key、Service Role Key 和 Bearer Token 不出现在响应、日志和数据库普通查询中；
- 被撤销的 Key 和 MCP 令牌立即失效；
- 篡改模型返回的 ID、操作和 payload 被服务端拒绝；
- 任务在提案后变化时返回冲突，不发生静默覆盖；
- 重复提交应用请求不创建重复任务或子任务；
- 超时、限流、额度不足和供应商 5xx 都转换为稳定错误码。

### 14.3 浏览器端测试

使用 Playwright 覆盖桌面端和 390px 移动端：

- 未配置 Key、配置中、验证失败和配置成功；
- 无工作记录、正常记录、超长中文记录和上下文裁剪；
- 分析加载、成功、失败、重新生成和历史切换；
- 证据引用跳转；
- 提案全选、部分选择、取消、确认、冲突和部分成功；
- 长任务标题、长建议和错误文案不溢出或遮挡其他控件；
- 键盘操作、焦点返回、对话框语义和状态播报。

### 14.4 Codex MCP 验收

- Codex CLI 能识别 MCP Server 和 5 个工具；
- `get_work_review_context` 与网页同范围数据一致；
- 只读令牌不能创建提案；
- `proposal:write` 可以保存提案但不能修改任务；
- 过期、撤销和错误权限令牌返回明确且不泄露数据的错误；
- Codex 返回的网页链接只能由提案所属登录用户打开；
- 用户在网页确认后，现有 Supabase Realtime 能刷新任务状态。

## 15. 上线与观测

第一版先对少量账号开放，通过服务端功能开关控制。重点记录以下不含正文和密钥的指标：

- 分析请求成功率、耗时和稳定错误码分布；
- 上下文被裁剪的比例；
- AI 建议的查看率和重新生成率；
- 提案创建、采纳、拒绝、冲突和失败数量；
- MCP 工具调用成功率和令牌错误率；
- 每用户模型输入/输出用量，供用户理解自己的 API 成本。

上线后优先观察“建议被采纳”和“用户是否回来查看复盘”，不使用模型生成次数作为核心价值指标。

## 16. 后续扩展

只有第一版验证有效后再考虑：

- MCP OAuth 和可选的 CLI 内直接确认执行；
- 最近 14 天、自然周和自定义范围；
- 用户可编辑的 AI 提案；
- 多模型供应商与模型选择器；
- 活动事件表，保存不可被任务当前状态覆盖的完整历史；
- 定时生成复盘草稿和提醒，但仍由用户主动查看与确认；
- 将人工确认后的 AI 复盘导出为周报或 Markdown。

## 17. 参考资料

- 项目内工作复盘口径：[`docs/recent-work-review-design.md`](recent-work-review-design.md)
- 项目内今日复盘口径：[`docs/daily-review-journal-design.md`](daily-review-journal-design.md)
- OpenAI Codex MCP 说明：[Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)
- OpenAI MCP Server 说明：[MCP server](https://developers.openai.com/plugins/concepts/mcp-server)
- OpenAI Codex 非交互模式：[Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- OpenAI Responses API 参考：[Responses API](https://platform.openai.com/docs/api-reference/responses)

实现时应重新核对 OpenAI 官方 API 文档中的当前模型、结构化输出和请求参数，不在本方案中固定可能变化的模型名称。
