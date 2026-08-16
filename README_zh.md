# TodoList

一款精致且响应式的任务管理工具，让个人事务井然有序，并可在多设备间保持同步。

[English Version](README.md) | [在线体验](https://gh4169.github.io/todolist/)

## 项目介绍

TodoList 帮助你整理日常工作：使用自定义分组收纳父任务、创建子任务、记录详细说明、调整优先顺序并跟踪完成进度。登录后，你可以在不同设备上访问实时同步的私人任务列表，并通过可折叠侧栏、显示设置和多套主题调整工作空间。

在技术实现上，应用使用 HTML、响应式 CSS 和模块化 Vanilla JS 构建。Supabase 负责账号认证、云端数据存储、访问控制与实时同步，静态前端则通过 GitHub Pages 托管。

## 界面预览

### 电脑端

![TodoList 电脑端工作台](output/playwright/readme-desktop.png)

### 手机端

<p align="center">
  <img src="output/playwright/readme-mobile.png" alt="TodoList 手机端工作台" width="390">
</p>

**核心功能：**

**用户功能：**

- 创建父任务和子任务，直接编辑标题与描述，标记完成状态，折叠任务组，并可批量清除已完成任务。
- 在进行中的父任务内优先显示未完成子任务，并将已完成子任务收纳到可记忆的折叠区。
- 将父任务或子任务独立安排到今天或任意未来日期，通过“后续待办”按日期集中查看未来计划，并可把往日未完成事项重新安排到今天或未来。
- 为父任务和子任务设置按日期保存的完成目标；卡片聚焦当前或最近目标，历史目标可在编辑面板中查看、修改和删除。
- 按日期评价父任务和子任务的每日完成情况；已安排任务到次日仍未评价时自动记为“未推进”，并保留当天目标快照供后续复盘。
- 在今日待办中记录按日期保存的“今日复盘”，整理计划外事务、探索、阻塞依赖和次日调整，并可从历史列表补充或修改往日记录；详见 [`docs/daily-review-journal-design.md`](docs/daily-review-journal-design.md)。
- 使用独立的“AI 伙伴”页面持续对话：引用 TodoList 记录、确认长期记忆、流式回答，并提出不会直接执行的任务变更建议。
- 通过带权限范围的 MCP 令牌连接 Codex，读取任务与已确认记忆，或保存等待网页审核的变更提案。
- 创建、排序、行内重命名和删除自定义分组，将父任务连同子任务拖动或批量移动到其他分组。
- 首次使用时从“今日待办”开始，之后返回上次打开的今日、明日、后续待办或任务分组视图。
- 默认显示进行中的任务，已完成任务收纳在列表底部的可记忆折叠区。
- 桌面端侧栏可折叠为一个安静的展开按钮，移动端则使用分组抽屉。
- 快速查看完成率、任务统计、子任务进度和时间记录。
- 使用邮箱注册和登录，设置可同步的昵称与字母头像，找回忘记的密码，并在不同设备上访问私人任务列表。
- 从六套可持久化主题中自由选择，并在桌面端与移动端获得舒适的使用体验。

**技术特点：**

- 使用语义化 HTML、响应式 CSS 和模块化 Vanilla JS，无需前端框架与构建步骤。
- 使用 Supabase Auth 和 PostgreSQL 持久化账号与任务数据，并通过行级安全策略和用户级关系实现数据隔离。
- 通过私有 Supabase Realtime Broadcast 频道，在多个在线客户端之间同步任务和分组变更。
- 使用 Supabase Edge Functions 在服务端构建复盘上下文并调用 OpenAI Responses API；用户 API Key 经过 AES-256-GCM 加密后保存，明文不会写入浏览器存储。
- 将任务内容、状态、描述、界面状态和排序结果持久化至云端，静态前端通过 GitHub Pages 部署。

> 💡 Tip: 如需查看完整效果，请访问[在线体验](https://gh4169.github.io/todolist/)地址。

## 数据库升级

部署本版本前，请在 Supabase SQL Editor 中完整执行最新的 [`supabase-schema.sql`](supabase-schema.sql)。脚本会增量创建分组、日期安排、完成目标、任务级完成评价、工作复盘、AI 伙伴会话与记忆、集成令牌、提案执行记录、私有广播和仅服务端可调用的全历史搜索 RPC；已有任务不会被修改或删除，历史 `ai_review_runs` 数据会保留。

## AI 伙伴与 Codex MCP 部署

当前版本使用独立的“AI 伙伴”页面：网页端对 Todo 数据保持只读，回答通过 Responses API 流式返回并附带引用；AI 最多提出三条长期记忆建议，用户可编辑后确认。旧的一键 AI 工作复盘入口已移除，但历史 `ai_review_runs` 行仍保留。

1. 安装并登录 Supabase CLI，然后把仓库关联到目标项目。
2. 复制 [`supabase/functions/.env.example`](supabase/functions/.env.example) 为本地私密配置，使用 `openssl rand -base64 32` 生成 `AI_CREDENTIAL_MASTER_KEY` 和 `INTEGRATION_TOKEN_PEPPER`。不要提交实际密钥。
3. 如果使用 Codex 中转站，将 `OPENAI_BASE_URL` 设置为中转站地址，将 `OPENAI_API_KEY` 设置为本机 `~/.codex/auth.json` 中的 `OPENAI_API_KEY`。本项目会把它作为服务器默认配置，用户无需再把密钥粘贴到网页；实际密钥只应保存在本地私密环境文件和 Supabase Secrets 中。根据部署域名设置 `ALLOWED_ORIGINS` 和 `PUBLIC_APP_URL`。服务地址必须支持 `/models`、`/responses` 和结构化输出。需要收紧外部访问时，可设置 `AI_PROVIDER_ALLOWED_HOSTS` 为逗号分隔的精确域名或域名后缀。
4. 上传配置并部署这些函数：

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy ai-credential
npx supabase functions deploy ai-review
npx supabase functions deploy ai-chat
npx supabase functions deploy ai-proposal
npx supabase functions deploy integration-token
npx supabase functions deploy todolist-mcp
```

Supabase 会向函数提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`，不要把这些服务端凭据放进网页代码。部署后，在设置页先保存并验证 API Key，再打开“AI 伙伴”。集成令牌最多同时保留五个，有效期 90 天，明文只在创建时显示一次。Codex 可通过环境变量接入：

```toml
[mcp_servers.todolist]
url = "https://<project-ref>.supabase.co/functions/v1/todolist-mcp"
bearer_token_env_var = "TODOLIST_MCP_TOKEN"
```

MCP 提供读取工具和 `create_change_proposal`；提案七天后过期，任何允许的任务操作都必须在网页中逐项勾选并二次确认。
