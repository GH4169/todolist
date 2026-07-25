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
- Create, rename, color, and reorder custom groups, then move parent tasks and their subtasks between groups individually or in bulk.
- Reorder tasks and subtasks with drag and drop so the most important work stays at the top.
- Focus on active tasks by default and reveal completed tasks in a remembered collapsible section at the bottom of each group.
- Collapse the desktop sidebar to a single quiet reveal button, or use the group drawer on mobile screens.
- Review completion rates, task statistics, subtask progress, and timestamps at a glance.
- Register and sign in with email, recover a forgotten password, and access a private task list that stays synchronized across devices.
- Choose from six persistent themes and use the responsive interface comfortably on desktop and mobile screens.

**Technical highlights:**

- Uses semantic HTML, responsive CSS, and modular Vanilla JavaScript without a frontend framework or build step.
- Uses Supabase Auth and PostgreSQL for persistent accounts and task data, protected by Row Level Security and user-scoped relationships.
- Propagates task and group changes between active clients through private Supabase Realtime Broadcast channels.
- Persists task content, status, descriptions, interface state, and ordering in the cloud, with the static frontend deployed on GitHub Pages.

> 💡 Tip: Visit the [Live Demo](https://gh4169.github.io/todolist/) to explore the complete experience.

## Database upgrade

Before deploying this version, run the latest [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor. The migration adds the group table and task group field incrementally. Existing tasks remain unchanged and appear under the built-in Unassigned group.
