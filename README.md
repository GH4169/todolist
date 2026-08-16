# TodoList

A polished, responsive task manager that keeps personal work organized and synchronized across devices.

[中文介绍](README_zh.md) | [Live Demo](https://gh4169.github.io/todolist/)

## Introduction

TodoList helps you organize everyday work with custom groups, parent tasks, subtasks, notes, ordering, and completion tracking. After signing in, your private workspace stays synchronized across devices, while a collapsible sidebar, display settings, and visual themes let you adapt it to your routine.

The application is built with HTML, responsive CSS, and modular Vanilla JavaScript. Supabase provides account authentication, cloud data storage, access control, and realtime synchronization, while GitHub Pages hosts the static frontend.

## Screenshots

### Desktop

![TodoList desktop workspace](output/playwright/readme-desktop.png)

### Mobile

<p align="center">
  <img src="output/playwright/readme-mobile.png" alt="TodoList mobile workspace" width="390">
</p>

**Key Features:**

**For users:**

- Create parent tasks and subtasks, edit titles and descriptions inline, mark work as complete, collapse task groups, and clear completed items in bulk.
- Keep active subtasks in focus while completed subtasks sit in a remembered collapsible section inside each active parent task.
- Schedule parent tasks or subtasks independently for Today or any future date, browse future plans grouped by date in Upcoming, and reschedule unfinished items into Today or a future day.
- Save date-specific completion goals for parent tasks and subtasks, show the current or nearest relevant goal on each card, and manage goal history from a focused editor.
- Review daily outcomes for parent tasks and subtasks; scheduled work left unreviewed by the next day is recorded as Not progressed with that day's goal snapshot preserved.
- Keep one optional daily review per local calendar day, with a concise Today entry and editable history for unplanned work, blockers, exploration, and next-day adjustments.
- Generate an evidence-linked AI work review for the recent period, then jump from each highlight, blocker, or recommendation back to its source task, outcome review, or daily review.
- Create, reorder, inline-rename, and delete custom groups, then move parent tasks and their subtasks between groups individually or in bulk.
- Reorder tasks and subtasks with drag and drop so the most important work stays at the top.
- Start in Today on first use, then return to the most recently opened Today, Tomorrow, Upcoming, or task-group view.
- Focus on active tasks by default and reveal completed tasks in a remembered collapsible section at the bottom of each group.
- Collapse the desktop sidebar to a single quiet reveal button, or use the group drawer on mobile screens.
- Review completion rates, task statistics, subtask progress, and timestamps at a glance.
- Register and sign in with email, set a synchronized nickname and initial avatar, recover a forgotten password, and access a private task list across devices.
- Choose from six persistent themes and use the responsive interface comfortably on desktop and mobile screens.

**Technical highlights:**

- Uses semantic HTML, responsive CSS, and modular Vanilla JavaScript without a frontend framework or build step.
- Uses Supabase Auth and PostgreSQL for persistent accounts and task data, protected by Row Level Security and user-scoped relationships.
- Propagates task and group changes between active clients through private Supabase Realtime Broadcast channels.
- Builds review context and calls the OpenAI Responses API inside Supabase Edge Functions; user API keys are encrypted with AES-256-GCM and never stored in browser storage.
- Persists task content, status, descriptions, interface state, and ordering in the cloud, with the static frontend deployed on GitHub Pages.

> 💡 Tip: Visit the [Live Demo](https://gh4169.github.io/todolist/) to explore the complete experience.

## Database upgrade

Before deploying this version, run the latest [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor. The migration incrementally adds group storage, date-based planning, completion goals and reviews, work reviews, and AI run records. Existing tasks remain unchanged and appear under the built-in Unassigned group.

## AI work review deployment

The current milestone implements the read-only web review: users save their AI provider API key in Settings, the server verifies and encrypts it, and Recent Review generates a structured analysis for the current seven-day range. Change proposals and the Codex CLI MCP integration remain follow-up work; see [`docs/ai-review-codex-integration-design.md`](docs/ai-review-codex-integration-design.md) for the complete boundary.

1. Install and authenticate the Supabase CLI, then link this repository to the target project.
2. Copy [`supabase/functions/.env.example`](supabase/functions/.env.example) to a private local environment file and generate `AI_CREDENTIAL_MASTER_KEY` with `openssl rand -base64 32`. Never commit the real key.
3. Set `ALLOWED_ORIGINS` for the deployed site. The Settings page lets each user choose a Base URL and model; `OPENAI_BASE_URL` and `OPENAI_MODEL` only provide defaults for older credentials or the initial settings state. The provider must support `/models`, `/responses`, and structured output. Optionally set `AI_PROVIDER_ALLOWED_HOSTS` to comma-separated exact hosts or suffixes to tighten outbound access.
4. Upload the secrets and deploy both functions:

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy ai-credential
npx supabase functions deploy ai-review
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the functions. Do not expose those server credentials in browser code. After deployment, save and verify an API key in Settings before generating a review.
