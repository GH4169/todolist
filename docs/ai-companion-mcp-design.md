# AI 伙伴与 Codex MCP 设计

状态：实施基线（2026-08-16）

本方案替代 [`ai-review-codex-integration-design.md`](ai-review-codex-integration-design.md) 中的一键 AI 工作复盘产品形态。历史 `ai_review_runs` 数据和表保留，但网页不再提供生成 AI 工作复盘的入口。

## 1. 产品边界

TodoList 新增独立“AI 伙伴”页面。它支持持久会话、连续追问、流式回答、来源引用和长期记忆，但网页 AI 对任务数据保持只读。AI 可以讨论工作、生活、关系、选择和情绪，目标是成为真诚、理性、不迎合的同行者；它不得把推测写成事实、进行医学诊断或保证某个选择一定让用户更幸福。

Codex 通过远程 Streamable HTTP MCP 读取 Todo 与已确认记忆，并可保存任务变更提案。MCP 永远不能直接修改任务。用户必须回到网页逐项勾选并二次确认，服务端才执行白名单操作。

## 2. 页面与交互

- 桌面端使用“会话列表 + 对话区”；移动端会话列表进入抽屉。
- AI 页顶部提供“对话 / 待确认”切换、长期记忆入口和新建会话命令。
- 发送后先显示“正在查找相关记录”，随后通过 SSE 增量展示回答；支持停止、失败重试和建议追问。
- 回答展示本轮使用的 Todo、目标、任务评价、每日复盘、人工复盘和记忆。点击来源可回到原任务或复盘。
- 用户可排除来源后重新回答。重新生成创建新的回答修订，原答案不会被覆盖。
- AI 每轮最多提出 3 条长期记忆，类型分为“用户明确陈述”和“AI 观察到的模式”。用户可编辑后确认，也可停用、启用、拒绝或删除。
- 会话支持新建、自动命名、重命名和删除。完整历史持久化；生成时只发送最近 12 轮且最多 24,000 字符。

## 3. 两阶段上下文

每轮请求分两阶段执行：

1. 检索规划：只发送当前问题和近期对话，模型返回日期范围、数据类型和扩展搜索词。
2. 回答生成：服务端调用 `search_ai_context_for_user(...)` 检索全历史，再补充近期 30 天基线、重要未完成任务和已确认记忆，裁剪后流式生成回答。

所有历史均可检索，但单轮最多 80 条来源，完整 `CompanionContextV1` 不超过 80,000 字符。超限时在 `limitations` 中说明遗漏数量，不把完整历史无差别发送给模型。

`CompanionContextV1` 的来源具有稳定引用：`todo:<uuid>`、`goal:<uuid>`、`completion_review:<uuid>`、`daily_review:<uuid>`、`work_review:<uuid>`、`memory:<uuid>`。模型输出中的引用必须存在于本轮上下文，校验后才保存。

## 4. 会话、回答与记忆

- `ai_conversations` 保存标题、所有权和最后活动时间。
- `ai_chat_messages` 保存用户/助手消息、状态、回答修订、上下文快照、模型、用量和稳定错误码。上下文快照只含本轮实际发送的裁剪来源。
- `ai_memories` 保存提议、启用、停用和拒绝状态、记忆类型及来源消息。
- 同一用户同一时间只允许一个 `streaming` 助手消息；默认每小时最多 20 次网页提问。

`ai-chat` 使用 Supabase JWT 鉴权并输出下列 SSE 事件：

```text
status
context
answer.delta
answer.completed
error
```

最终 `AICompanionResultV1` 包含 `answer`、`citations`、`suggested_followups`、`memory_proposals` 和 `limitations`。模型请求必须使用 Responses API、`stream: true`、`store: false`，不依赖供应商保存对话状态。检索规划超时 25 秒，回答流超时 90 秒；中转服务必须真正支持 `/responses`、结构化输出和 Responses SSE，不支持时返回明确错误，不伪造流式体验。

## 5. MCP 与集成令牌

`todolist-mcp` 是无状态 Streamable HTTP MCP Edge Function，固定使用 MCP 2.0 协议契约，暴露：

- `search_context`
- `list_tasks`
- `get_task`
- `list_memories`
- `create_change_proposal`
- `get_change_proposal`

集成令牌由 `integration-token` 创建、列出和撤销。令牌默认具有 `review:read` 与 `proposal:write`，永久有效且可随时撤销，每用户最多 5 个有效令牌。明文只在创建时返回一次；数据库只保存 `INTEGRATION_TOKEN_PEPPER` 参与计算的 SHA-256 哈希。`mcp_request_logs` 只保存工具名、状态、耗时和结果数量，不记录正文、令牌或 Authorization 头。

Gemini Spark 通过标准 MCP OAuth 2.1 连接：MCP 的 401 响应提供 Protected Resource Metadata 地址，元数据把 Supabase Auth 声明为 Authorization Server。Supabase 开启 Dynamic Client Registration，并把授权确认页路径设为 `/`；由于站点地址已经是 `https://gh4169.github.io/todolist/`，最终授权页是该地址本身，避免重复拼接 `/todolist/todolist/`。用户登录 TodoList 并明确同意后，Gemini 才获得绑定该用户的短期访问令牌。Codex CLI 继续使用独立的 `tdl_...` 集成令牌，两类凭据都映射到相同的只读/提案权限边界。

Codex CLI 示例：

```toml
[mcp_servers.todolist]
url = "https://<project-ref>.supabase.co/functions/v1/todolist-mcp"
bearer_token_env_var = "TODOLIST_MCP_TOKEN"
```

## 6. 任务变更提案

提案只允许四类操作：改期 `reschedule_task`、新建父任务 `create_task`、新建子任务 `create_subtask`、设置完成目标 `set_completion_goal`。每组最多 10 项，7 天过期；禁止删除、标记完成、修改任务正文或执行任意字段路径。

提案保存标题、摘要、来源令牌、稳定幂等 ID 和逐项执行结果。网页提交时只发送所选项目 ID；服务端重新加载数据库中的操作内容，并逐项检查提案和任务所有权、过期时间、任务 `updated_at`、字段与父子关系、幂等键和证据引用。批次允许部分成功，每项保存明确结果，重复提交已成功项直接返回原结果。

## 7. 数据隔离与部署

会话、消息、记忆和提案向 `authenticated` 角色开放必要的自有记录权限并启用 RLS；模型凭据、集成令牌和 MCP 日志仅允许 service role 访问。`search_ai_context_for_user(...)` 撤销 `anon/authenticated/public` 执行权限，只授予 `service_role`。

部署环境新增 `INTEGRATION_TOKEN_PEPPER` 和 `PUBLIC_APP_URL`，与既有 `AI_CREDENTIAL_MASTER_KEY`、Supabase 密钥和 `ALLOWED_ORIGINS` 一起配置。需部署 `ai-chat`、`integration-token`、`ai-proposal`、`todolist-mcp`；MCP 自行验证自定义 Bearer Token 或 Supabase OAuth JWT，因此关闭网关 JWT 校验。Supabase Auth 还需开启 OAuth Server 和 Dynamic Client Registration，并将 Authorization Path 设置为 `/`（站点地址已包含 `/todolist/`）。

## 8. 验收

- SSE/JSON 增量解析覆盖 Unicode、转义字符和任意分块边界。
- 覆盖无记录、全历史命中、上下文裁剪、排除来源重答、停止、断流和中转站错误。
- 使用两个账号验证会话、记忆、令牌、MCP、提案和任务完全隔离。
- 覆盖令牌撤销、错误权限、限流和日志脱敏。
- 覆盖四类操作的成功、冲突、重复提交、部分成功与过期。
- Codex CLI 可以初始化 MCP、列出工具、读取数据和保存提案，但不能直接修改任务。
- Playwright 检查桌面与 390px 移动端的会话、流式回复、来源、记忆和提案流程。
