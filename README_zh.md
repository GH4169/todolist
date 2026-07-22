# Todolist

一款精致且响应式的任务管理工具，让个人事务井然有序，并可在多设备间保持同步。

[English Version](README.md) | [在线体验](https://gh4169.github.io/todolist/)

## 项目介绍

Todolist 帮助你整理日常工作：创建任务和子任务、记录详细说明、调整优先顺序并跟踪完成进度。登录后，你可以在不同设备上访问实时同步的私人任务列表，还能通过筛选、统计和多套主题打造适合自己的工作空间。

在技术实现上，应用使用 HTML、响应式 CSS 和模块化 Vanilla JS 构建。Supabase 负责账号认证、云端数据存储、访问控制与实时同步，静态前端则通过 GitHub Pages 托管。

## 界面预览

### 电脑端

![Todolist 电脑端工作台](output/playwright/readme-desktop.png)

### 手机端

<p align="center">
  <img src="output/playwright/readme-mobile.png" alt="Todolist 手机端工作台" width="390">
</p>

**核心功能：**

**用户功能：**

- 创建父任务和子任务，直接编辑标题与描述，标记完成状态，折叠任务组，并可批量清除已完成任务。
- 通过拖拽调整父任务和子任务的顺序，让重要事项始终位于前列。
- 首次进入默认显示待完成任务，可在全部、待完成和已完成视图间切换，并在当前浏览器中按账号恢复上一次选择。
- 快速查看完成率、任务统计、子任务进度和时间记录。
- 使用邮箱注册和登录，找回忘记的密码，并在不同设备上访问实时同步的私人任务列表。
- 从六套可持久化主题中自由选择，并在桌面端与移动端获得舒适的使用体验。

**技术特点：**

- 使用语义化 HTML、响应式 CSS 和模块化 Vanilla JS，无需前端框架与构建步骤。
- 使用 Supabase Auth 和 PostgreSQL 持久化账号与任务数据，并通过行级安全策略和用户级关系实现数据隔离。
- 通过私有 Supabase Realtime Broadcast 频道，在多个在线客户端之间同步任务变更。
- 将任务内容、状态、描述、界面状态和排序结果持久化至云端，静态前端通过 GitHub Pages 部署。

> 💡 Tip: 如需查看完整效果，请访问[在线体验](https://gh4169.github.io/todolist/)地址。
