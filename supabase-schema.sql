-- 在 Supabase SQL Editor 中完整执行本文件。
create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid,
  text text not null check (length(trim(text)) > 0),
  description text not null default '',
  is_completed boolean not null default false,
  is_collapsed boolean not null default false,
  is_description_open boolean not null default false,
  position integer not null default 0 check (position >= 0),
  planned_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint todos_cannot_parent_itself check (parent_id is null or parent_id <> id),
  constraint todos_id_user_id_key unique (id, user_id),
  constraint todos_parent_owner_fkey foreign key (parent_id, user_id)
    references public.todos(id, user_id) on delete cascade
);

create table if not exists public.todo_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  color text not null default '#9fc79f' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_categories_id_user_id_key unique (id, user_id)
);

create table if not exists public.todo_completion_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  todo_id uuid not null,
  target_date date not null,
  content text not null check (length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_completion_goals_todo_owner_fkey foreign key (todo_id, user_id)
    references public.todos(id, user_id) on delete cascade,
  constraint todo_completion_goals_one_per_day unique (todo_id, target_date)
);

create table if not exists public.todo_completion_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  todo_id uuid not null,
  review_date date not null,
  result text not null,
  content text not null,
  goal_content_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_completion_reviews_result_check
    check (result in ('achieved', 'partial', 'missed')),
  constraint todo_completion_reviews_goal_snapshot_check check (
    goal_content_snapshot is null
    or length(trim(goal_content_snapshot)) between 1 and 500
  ),
  constraint todo_completion_reviews_todo_owner_fkey foreign key (todo_id, user_id)
    references public.todos(id, user_id) on delete cascade,
  constraint todo_completion_reviews_one_per_day unique (todo_id, review_date)
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  review_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_reviews_content_check check (
    length(trim(content)) between 1 and 3000
  ),
  constraint daily_reviews_one_per_day unique (user_id, review_date)
);

create table if not exists public.work_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_reviews_range_check check (range_start <= range_end),
  constraint work_reviews_content_check check (length(trim(content)) between 1 and 3000),
  constraint work_reviews_one_per_range unique (user_id, range_start, range_end)
);

-- 用户模型凭据只允许 Edge Function 通过 service role 访问。
create table if not exists public.ai_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'openai',
  base_url text not null default 'https://api.openai.com/v1',
  model text not null default 'gpt-5.6',
  encrypted_secret text not null,
  iv text not null,
  key_version integer not null default 1 check (key_version > 0),
  key_hint text not null check (length(key_hint) between 1 and 12),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_credentials_provider_check check (provider in ('openai')),
  constraint ai_provider_credentials_base_url_check check (length(trim(base_url)) between 12 and 500),
  constraint ai_provider_credentials_model_check check (length(trim(model)) between 1 and 120),
  constraint ai_provider_credentials_one_per_provider unique (user_id, provider)
);

alter table public.ai_provider_credentials
  add column if not exists base_url text not null default 'https://api.openai.com/v1';
alter table public.ai_provider_credentials
  add column if not exists model text not null default 'gpt-5.6';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_provider_credentials_base_url_check'
      and conrelid = 'public.ai_provider_credentials'::regclass
  ) then
    alter table public.ai_provider_credentials
      add constraint ai_provider_credentials_base_url_check
      check (length(trim(base_url)) between 12 and 500);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_provider_credentials_model_check'
      and conrelid = 'public.ai_provider_credentials'::regclass
  ) then
    alter table public.ai_provider_credentials
      add constraint ai_provider_credentials_model_check
      check (length(trim(model)) between 1 and 120);
  end if;
end
$$;

-- ============================================================
-- AI 伙伴、长期记忆与 Codex MCP（增量，保留旧 AI 复盘数据）
-- ============================================================

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '新对话' check (length(trim(title)) between 1 and 80),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_id_user_id_key unique (id, user_id)
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (length(content) <= 50000),
  status text not null default 'completed'
    check (status in ('pending', 'searching', 'streaming', 'completed', 'stopped', 'failed')),
  reply_to_id uuid,
  revision_of_id uuid,
  revision_number integer not null default 1 check (revision_number between 1 and 100),
  context_snapshot jsonb,
  result jsonb,
  model text,
  usage jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_chat_messages_conversation_owner_fkey foreign key (conversation_id, user_id)
    references public.ai_conversations(id, user_id) on delete cascade,
  constraint ai_chat_messages_reply_fkey foreign key (reply_to_id)
    references public.ai_chat_messages(id) on delete set null,
  constraint ai_chat_messages_revision_fkey foreign key (revision_of_id)
    references public.ai_chat_messages(id) on delete set null,
  constraint ai_chat_messages_context_check
    check (context_snapshot is null or jsonb_typeof(context_snapshot) = 'object'),
  constraint ai_chat_messages_result_check
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint ai_chat_messages_usage_check
    check (usage is null or jsonb_typeof(usage) = 'object')
);

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 500),
  kind text not null check (kind in ('explicit_statement', 'observed_pattern')),
  status text not null default 'proposed'
    check (status in ('proposed', 'enabled', 'disabled', 'rejected')),
  source_message_id uuid references public.ai_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  disabled_at timestamptz
);

create index if not exists ai_conversations_user_active_idx
  on public.ai_conversations(user_id, last_active_at desc);
create index if not exists ai_chat_messages_conversation_created_idx
  on public.ai_chat_messages(conversation_id, created_at, revision_number);
create unique index if not exists ai_chat_messages_one_stream_per_user_idx
  on public.ai_chat_messages(user_id)
  where role = 'assistant' and status in ('searching', 'streaming');
create index if not exists ai_memories_user_status_updated_idx
  on public.ai_memories(user_id, status, updated_at desc);
alter table public.ai_conversations enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_memories enable row level security;
revoke all privileges on table public.ai_conversations from anon, public;
revoke all privileges on table public.ai_chat_messages from anon, public;
revoke all privileges on table public.ai_memories from anon, public;
grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant select, insert, update, delete on table public.ai_chat_messages to authenticated;
grant select, insert, update, delete on table public.ai_memories to authenticated;

drop policy if exists "Users manage own AI conversations" on public.ai_conversations;
create policy "Users manage own AI conversations"
on public.ai_conversations for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own AI chat messages" on public.ai_chat_messages;
create policy "Users manage own AI chat messages"
on public.ai_chat_messages for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own AI memories" on public.ai_memories;
create policy "Users manage own AI memories"
on public.ai_memories for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create table if not exists public.ai_review_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  status text not null default 'pending',
  provider text not null default 'openai',
  model text,
  prompt_version text not null default 'review-v1',
  context_hash text,
  context_stats jsonb not null default '{}'::jsonb,
  result jsonb,
  usage jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_review_runs_range_check check (range_start <= range_end),
  constraint ai_review_runs_status_check check (status in ('pending', 'succeeded', 'failed')),
  constraint ai_review_runs_provider_check check (provider in ('openai')),
  constraint ai_review_runs_context_stats_check check (jsonb_typeof(context_stats) = 'object'),
  constraint ai_review_runs_result_check check (result is null or jsonb_typeof(result) = 'object'),
  constraint ai_review_runs_usage_check check (usage is null or jsonb_typeof(usage) = 'object')
);

create table if not exists public.ai_change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_review_run_id uuid references public.ai_review_runs(id) on delete cascade,
  source text not null,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint ai_change_proposals_source_check check (source in ('web_ai', 'codex_mcp')),
  constraint ai_change_proposals_status_check check (
    status in ('pending', 'partially_applied', 'applied', 'rejected', 'expired')
  )
);

create table if not exists public.ai_change_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ai_change_proposals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  target_todo_id uuid references public.todos(id) on delete set null,
  expected_updated_at timestamptz,
  payload jsonb not null,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  evidence_refs jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  idempotency_key uuid not null default gen_random_uuid(),
  applied_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_change_proposal_items_operation_check check (
    operation in ('reschedule_task', 'create_task', 'create_subtask', 'set_completion_goal')
  ),
  constraint ai_change_proposal_items_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint ai_change_proposal_items_evidence_check check (jsonb_typeof(evidence_refs) = 'array'),
  constraint ai_change_proposal_items_status_check check (
    status in ('pending', 'applied', 'conflict', 'invalid', 'failed', 'rejected')
  ),
  constraint ai_change_proposal_items_idempotency_key_key unique (idempotency_key)
);

-- Codex MCP 令牌只保存哈希，明文仅在创建时返回一次。
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  token_prefix text not null check (length(token_prefix) between 8 and 24),
  token_hash text not null unique,
  scopes text[] not null default array['review:read']::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint integration_tokens_scopes_check check (
    cardinality(scopes) > 0
    and scopes <@ array['review:read', 'proposal:write']::text[]
  )
);

-- 兼容曾提前创建过目标表但字段不完整的部署。
alter table public.todo_completion_goals add column if not exists user_id uuid;
alter table public.todo_completion_goals add column if not exists todo_id uuid;
alter table public.todo_completion_goals add column if not exists target_date date;
alter table public.todo_completion_goals add column if not exists content text;
alter table public.todo_completion_goals add column if not exists created_at timestamptz not null default now();
alter table public.todo_completion_goals add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_goals_user_id_fkey'
      and conrelid = 'public.todo_completion_goals'::regclass
  ) then
    alter table public.todo_completion_goals
      add constraint todo_completion_goals_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_goals_todo_owner_fkey'
      and conrelid = 'public.todo_completion_goals'::regclass
  ) then
    alter table public.todo_completion_goals
      add constraint todo_completion_goals_todo_owner_fkey
      foreign key (todo_id, user_id) references public.todos(id, user_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_goals_one_per_day'
      and conrelid = 'public.todo_completion_goals'::regclass
  ) then
    alter table public.todo_completion_goals
      add constraint todo_completion_goals_one_per_day unique (todo_id, target_date);
  end if;
end
$$;

-- 兼容曾提前创建过评价表但字段不完整的部署。
alter table public.todo_completion_reviews add column if not exists user_id uuid;
alter table public.todo_completion_reviews add column if not exists todo_id uuid;
alter table public.todo_completion_reviews add column if not exists review_date date;
alter table public.todo_completion_reviews add column if not exists result text;
alter table public.todo_completion_reviews add column if not exists content text;
alter table public.todo_completion_reviews add column if not exists goal_content_snapshot text;
alter table public.todo_completion_reviews add column if not exists created_at timestamptz not null default now();
alter table public.todo_completion_reviews add column if not exists updated_at timestamptz not null default now();

-- 已达成且保留了目标快照时，结构化结果本身足以形成一条可解释记录。
alter table public.todo_completion_reviews
  drop constraint if exists todo_completion_reviews_content_check;
alter table public.todo_completion_reviews
  add constraint todo_completion_reviews_content_check check (
    length(trim(content)) between 1 and 500
    or (
      result = 'achieved'
      and length(trim(content)) = 0
      and goal_content_snapshot is not null
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_reviews_user_id_fkey'
      and conrelid = 'public.todo_completion_reviews'::regclass
  ) then
    alter table public.todo_completion_reviews
      add constraint todo_completion_reviews_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_reviews_todo_owner_fkey'
      and conrelid = 'public.todo_completion_reviews'::regclass
  ) then
    alter table public.todo_completion_reviews
      add constraint todo_completion_reviews_todo_owner_fkey
      foreign key (todo_id, user_id) references public.todos(id, user_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_reviews_one_per_day'
      and conrelid = 'public.todo_completion_reviews'::regclass
  ) then
    alter table public.todo_completion_reviews
      add constraint todo_completion_reviews_one_per_day unique (todo_id, review_date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_reviews_result_check'
      and conrelid = 'public.todo_completion_reviews'::regclass
  ) then
    alter table public.todo_completion_reviews
      add constraint todo_completion_reviews_result_check
      check (result in ('achieved', 'partial', 'missed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'todo_completion_reviews_goal_snapshot_check'
      and conrelid = 'public.todo_completion_reviews'::regclass
  ) then
    alter table public.todo_completion_reviews
      add constraint todo_completion_reviews_goal_snapshot_check
      check (
        goal_content_snapshot is null
        or length(trim(goal_content_snapshot)) between 1 and 500
      );
  end if;
end
$$;

-- 现有任务保持 NULL，并由客户端显示为不可删除的“未分组”。
alter table public.todos add column if not exists category_id uuid;
alter table public.todos add column if not exists planned_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todos_category_owner_fkey'
      and conrelid = 'public.todos'::regclass
  ) then
    alter table public.todos
      add constraint todos_category_owner_fkey foreign key (category_id, user_id)
      references public.todo_categories(id, user_id);
  end if;
end
$$;

create index if not exists todos_user_parent_position_idx
  on public.todos(user_id, parent_id, position);

create index if not exists todos_completed_idx
  on public.todos(is_completed);

create index if not exists todos_user_category_position_idx
  on public.todos(user_id, category_id, position)
  where parent_id is null;

create index if not exists todos_user_planned_date_idx
  on public.todos(user_id, planned_date)
  where planned_date is not null;

create index if not exists todo_categories_user_position_idx
  on public.todo_categories(user_id, position);

create index if not exists todo_completion_goals_user_todo_date_idx
  on public.todo_completion_goals(user_id, todo_id, target_date desc);

create index if not exists todo_completion_reviews_user_todo_date_idx
  on public.todo_completion_reviews(user_id, todo_id, review_date desc);

create index if not exists daily_reviews_user_date_idx
  on public.daily_reviews(user_id, review_date desc);

create index if not exists work_reviews_user_range_idx
  on public.work_reviews(user_id, range_end desc, range_start desc);

create index if not exists ai_review_runs_user_created_idx
  on public.ai_review_runs(user_id, created_at desc);

create unique index if not exists ai_review_runs_one_pending_per_user_idx
  on public.ai_review_runs(user_id)
  where status = 'pending';

create index if not exists ai_change_proposals_user_created_idx
  on public.ai_change_proposals(user_id, created_at desc);

create index if not exists ai_change_proposal_items_proposal_idx
  on public.ai_change_proposal_items(proposal_id, created_at);

create index if not exists integration_tokens_user_created_idx
  on public.integration_tokens(user_id, created_at desc);

create or replace function public.set_todos_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_todos_updated_at on public.todos;
create trigger set_todos_updated_at
before update on public.todos
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_todo_categories_updated_at on public.todo_categories;
create trigger set_todo_categories_updated_at
before update on public.todo_categories
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_todo_completion_goals_updated_at on public.todo_completion_goals;
create trigger set_todo_completion_goals_updated_at
before update on public.todo_completion_goals
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_todo_completion_reviews_updated_at on public.todo_completion_reviews;
create trigger set_todo_completion_reviews_updated_at
before update on public.todo_completion_reviews
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_daily_reviews_updated_at on public.daily_reviews;
create trigger set_daily_reviews_updated_at
before update on public.daily_reviews
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_work_reviews_updated_at on public.work_reviews;
create trigger set_work_reviews_updated_at
before update on public.work_reviews
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_ai_provider_credentials_updated_at on public.ai_provider_credentials;
create trigger set_ai_provider_credentials_updated_at
before update on public.ai_provider_credentials
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_ai_change_proposals_updated_at on public.ai_change_proposals;
create trigger set_ai_change_proposals_updated_at
before update on public.ai_change_proposals
for each row execute function public.set_todos_updated_at();

alter table public.todos enable row level security;
alter table public.todo_categories enable row level security;
alter table public.todo_completion_goals enable row level security;
alter table public.todo_completion_reviews enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.work_reviews enable row level security;
alter table public.ai_provider_credentials enable row level security;
alter table public.ai_review_runs enable row level security;
alter table public.ai_change_proposals enable row level security;
alter table public.ai_change_proposal_items enable row level security;
alter table public.integration_tokens enable row level security;

revoke all privileges on table public.todos from anon;
revoke all privileges on table public.todos from public;
grant select, insert, update, delete on table public.todos to authenticated;
revoke all privileges on table public.todo_categories from anon;
revoke all privileges on table public.todo_categories from public;
grant select, insert, update, delete on table public.todo_categories to authenticated;
revoke all privileges on table public.todo_completion_goals from anon;
revoke all privileges on table public.todo_completion_goals from public;
grant select, insert, update, delete on table public.todo_completion_goals to authenticated;
revoke all privileges on table public.todo_completion_reviews from anon;
revoke all privileges on table public.todo_completion_reviews from public;
grant select, insert, update, delete on table public.todo_completion_reviews to authenticated;
revoke all privileges on table public.daily_reviews from anon;
revoke all privileges on table public.daily_reviews from public;
grant select, insert, update, delete on table public.daily_reviews to authenticated;
revoke all privileges on table public.work_reviews from anon;
revoke all privileges on table public.work_reviews from public;
grant select, insert, update, delete on table public.work_reviews to authenticated;

revoke all privileges on table public.ai_provider_credentials from anon, authenticated, public;
revoke all privileges on table public.integration_tokens from anon, authenticated, public;

revoke all privileges on table public.ai_review_runs from anon, public;
grant select, delete on table public.ai_review_runs to authenticated;
revoke all privileges on table public.ai_change_proposals from anon, public;
grant select on table public.ai_change_proposals to authenticated;
revoke all privileges on table public.ai_change_proposal_items from anon, public;
grant select on table public.ai_change_proposal_items to authenticated;

drop policy if exists "Users can view own todos" on public.todos;
drop policy if exists "Users can create own todos" on public.todos;
drop policy if exists "Users can update own todos" on public.todos;
drop policy if exists "Users can delete own todos" on public.todos;

create policy "Users can view own todos"
on public.todos for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own todos"
on public.todos for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own todos"
on public.todos for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own todos"
on public.todos for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own todo categories" on public.todo_categories;
drop policy if exists "Users can create own todo categories" on public.todo_categories;
drop policy if exists "Users can update own todo categories" on public.todo_categories;
drop policy if exists "Users can delete own todo categories" on public.todo_categories;

create policy "Users can view own todo categories"
on public.todo_categories for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own todo categories"
on public.todo_categories for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own todo categories"
on public.todo_categories for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own todo categories"
on public.todo_categories for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own todo completion goals" on public.todo_completion_goals;
drop policy if exists "Users can create own todo completion goals" on public.todo_completion_goals;
drop policy if exists "Users can update own todo completion goals" on public.todo_completion_goals;
drop policy if exists "Users can delete own todo completion goals" on public.todo_completion_goals;

create policy "Users can view own todo completion goals"
on public.todo_completion_goals for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own todo completion goals"
on public.todo_completion_goals for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own todo completion goals"
on public.todo_completion_goals for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own todo completion goals"
on public.todo_completion_goals for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own todo completion reviews" on public.todo_completion_reviews;
drop policy if exists "Users can create own todo completion reviews" on public.todo_completion_reviews;
drop policy if exists "Users can update own todo completion reviews" on public.todo_completion_reviews;
drop policy if exists "Users can delete own todo completion reviews" on public.todo_completion_reviews;

create policy "Users can view own todo completion reviews"
on public.todo_completion_reviews for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own todo completion reviews"
on public.todo_completion_reviews for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own todo completion reviews"
on public.todo_completion_reviews for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own todo completion reviews"
on public.todo_completion_reviews for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own daily reviews" on public.daily_reviews;
drop policy if exists "Users can create own daily reviews" on public.daily_reviews;
drop policy if exists "Users can update own daily reviews" on public.daily_reviews;
drop policy if exists "Users can delete own daily reviews" on public.daily_reviews;

create policy "Users can view own daily reviews"
on public.daily_reviews for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own daily reviews"
on public.daily_reviews for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own daily reviews"
on public.daily_reviews for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own daily reviews"
on public.daily_reviews for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own work reviews" on public.work_reviews;
drop policy if exists "Users can create own work reviews" on public.work_reviews;
drop policy if exists "Users can update own work reviews" on public.work_reviews;
drop policy if exists "Users can delete own work reviews" on public.work_reviews;

create policy "Users can view own work reviews"
on public.work_reviews for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own work reviews"
on public.work_reviews for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own work reviews"
on public.work_reviews for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own work reviews"
on public.work_reviews for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own AI review runs" on public.ai_review_runs;
drop policy if exists "Users can delete own AI review runs" on public.ai_review_runs;
create policy "Users can view own AI review runs"
on public.ai_review_runs for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users can delete own AI review runs"
on public.ai_review_runs for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own AI proposals" on public.ai_change_proposals;
create policy "Users can view own AI proposals"
on public.ai_change_proposals for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view own AI proposal items" on public.ai_change_proposal_items;
create policy "Users can view own AI proposal items"
on public.ai_change_proposal_items for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.broadcast_todo_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'todos:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_todo_changes on public.todos;
create trigger broadcast_todo_changes
after insert or update or delete on public.todos
for each row execute function public.broadcast_todo_changes();

create or replace function public.broadcast_todo_category_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'todo-categories:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_todo_category_changes on public.todo_categories;
create trigger broadcast_todo_category_changes
after insert or update or delete on public.todo_categories
for each row execute function public.broadcast_todo_category_changes();

create or replace function public.broadcast_todo_completion_goal_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'todo-completion-goals:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_todo_completion_goal_changes on public.todo_completion_goals;
create trigger broadcast_todo_completion_goal_changes
after insert or update or delete on public.todo_completion_goals
for each row execute function public.broadcast_todo_completion_goal_changes();

create or replace function public.broadcast_todo_completion_review_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'todo-completion-reviews:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_todo_completion_review_changes on public.todo_completion_reviews;
create trigger broadcast_todo_completion_review_changes
after insert or update or delete on public.todo_completion_reviews
for each row execute function public.broadcast_todo_completion_review_changes();

create or replace function public.broadcast_daily_review_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'daily-reviews:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_daily_review_changes on public.daily_reviews;
create trigger broadcast_daily_review_changes
after insert or update or delete on public.daily_reviews
for each row execute function public.broadcast_daily_review_changes();

create or replace function public.broadcast_work_review_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'work-reviews:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_work_review_changes on public.work_reviews;
create trigger broadcast_work_review_changes
after insert or update or delete on public.work_reviews
for each row execute function public.broadcast_work_review_changes();

drop policy if exists "Users can receive own todo broadcasts" on realtime.messages;
create policy "Users can receive own todo broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) in (
    'todos:' || (select auth.uid())::text,
    'todo-categories:' || (select auth.uid())::text,
    'todo-completion-goals:' || (select auth.uid())::text,
    'todo-completion-reviews:' || (select auth.uid())::text,
    'daily-reviews:' || (select auth.uid())::text,
    'work-reviews:' || (select auth.uid())::text
  )
);

-- AI 伙伴检索只允许服务端调用，避免客户端绕过上下文裁剪策略。
create or replace function public.search_ai_context_for_user(
  p_user_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_types text[] default array['todo', 'completion_goal', 'completion_review', 'daily_review', 'work_review', 'memory']::text[],
  p_search_terms text[] default '{}'::text[],
  p_limit integer default 80
)
returns table (
  source_type text,
  source_id uuid,
  occurred_on date,
  title text,
  content text,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select
      'todo'::text as source_type,
      t.id as source_id,
      coalesce(t.planned_date, (t.created_at at time zone 'UTC')::date) as occurred_on,
      t.text as title,
      concat_ws(E'\n', nullif(t.description, ''), case when t.is_completed then '已完成' else '未完成' end) as content,
      jsonb_build_object('is_completed', t.is_completed, 'planned_date', t.planned_date, 'parent_id', t.parent_id, 'category_id', t.category_id) as metadata
    from public.todos t
    where t.user_id = p_user_id and 'todo' = any(p_types)
    union all
    select 'completion_goal'::text, g.id, g.target_date, '完成目标', g.content,
      jsonb_build_object('todo_id', g.todo_id)
    from public.todo_completion_goals g
    where g.user_id = p_user_id and 'completion_goal' = any(p_types)
    union all
    select 'completion_review'::text, r.id, r.review_date,
      case r.result when 'achieved' then '目标已达成' when 'partial' then '目标部分完成' else '目标未完成' end,
      r.content,
      jsonb_build_object('todo_id', r.todo_id, 'result', r.result, 'goal_content_snapshot', r.goal_content_snapshot)
    from public.todo_completion_reviews r
    where r.user_id = p_user_id and 'completion_review' = any(p_types)
    union all
    select 'daily_review'::text, d.id, d.review_date, '每日复盘', d.content, '{}'::jsonb
    from public.daily_reviews d
    where d.user_id = p_user_id and 'daily_review' = any(p_types)
    union all
    select 'work_review'::text, w.id, w.range_end, '人工近期复盘', w.content,
      jsonb_build_object('range_start', w.range_start, 'range_end', w.range_end)
    from public.work_reviews w
    where w.user_id = p_user_id and 'work_review' = any(p_types)
    union all
    select 'memory'::text, m.id, (m.updated_at at time zone 'UTC')::date,
      case m.kind when 'explicit_statement' then '长期记忆：明确陈述' else '长期记忆：观察模式' end,
      m.content,
      jsonb_build_object('kind', m.kind, 'status', m.status, 'source_message_id', m.source_message_id)
    from public.ai_memories m
    where m.user_id = p_user_id and m.status = 'enabled' and 'memory' = any(p_types)
  )
  select c.source_type, c.source_id, c.occurred_on, c.title, c.content, c.metadata
  from candidates c
  where (p_start_date is null or c.occurred_on >= p_start_date)
    and (p_end_date is null or c.occurred_on <= p_end_date)
    and (
      coalesce(cardinality(p_search_terms), 0) = 0
      or exists (
        select 1
        from unnest(p_search_terms) term
        where lower(concat_ws(' ', c.title, c.content)) like '%' || lower(term) || '%'
      )
    )
  order by c.occurred_on desc nulls last
  limit least(greatest(coalesce(p_limit, 80), 1), 80);
$$;

revoke all on function public.search_ai_context_for_user(uuid, date, date, text[], text[], integer) from public, anon, authenticated;
grant execute on function public.search_ai_context_for_user(uuid, date, date, text[], text[], integer) to service_role;

create or replace function public.broadcast_ai_companion_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := coalesce(new.user_id, old.user_id);
begin
  perform realtime.broadcast_changes(
    'ai-companion:' || target_user::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists ai_conversations_broadcast on public.ai_conversations;
create trigger ai_conversations_broadcast
after insert or update or delete on public.ai_conversations
for each row execute function public.broadcast_ai_companion_changes();

drop trigger if exists ai_chat_messages_broadcast on public.ai_chat_messages;
create trigger ai_chat_messages_broadcast
after insert or update or delete on public.ai_chat_messages
for each row execute function public.broadcast_ai_companion_changes();

drop trigger if exists ai_memories_broadcast on public.ai_memories;
create trigger ai_memories_broadcast
after insert or update or delete on public.ai_memories
for each row execute function public.broadcast_ai_companion_changes();

-- 私有 Broadcast 负责实时同步，避免不可过滤的 Postgres Changes DELETE 事件。
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todos'
  ) then
    alter publication supabase_realtime drop table public.todos;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_categories'
  ) then
    alter publication supabase_realtime drop table public.todo_categories;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_completion_goals'
  ) then
    alter publication supabase_realtime drop table public.todo_completion_goals;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_completion_reviews'
  ) then
    alter publication supabase_realtime drop table public.todo_completion_reviews;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_reviews'
  ) then
    alter publication supabase_realtime drop table public.daily_reviews;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'work_reviews'
  ) then
    alter publication supabase_realtime drop table public.work_reviews;
  end if;
end
$$;

-- 集成令牌永久有效，只有用户主动撤销时才会失效。保留字段以兼容已有部署。
alter table public.integration_tokens
  alter column expires_at drop default,
  alter column expires_at drop not null;

update public.integration_tokens
set expires_at = null
where expires_at is not null;

-- 依赖 integration_tokens / ai_change_proposals 的增量字段必须在旧表创建后执行。
create table if not exists public.mcp_request_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  integration_token_id uuid references public.integration_tokens(id) on delete set null,
  tool_name text not null check (length(tool_name) between 1 and 80),
  status text not null check (status in ('succeeded', 'failed', 'denied')),
  duration_ms integer not null check (duration_ms >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.ai_change_proposals add column if not exists title text default 'TodoList 提案';
alter table public.ai_change_proposals add column if not exists summary text default '';
alter table public.ai_change_proposals add column if not exists source_token_id uuid;
alter table public.ai_change_proposals add column if not exists stable_id uuid not null default gen_random_uuid();
alter table public.ai_change_proposals add column if not exists execution_results jsonb not null default '[]'::jsonb;
alter table public.ai_change_proposal_items add column if not exists execution_result jsonb;
alter table public.ai_change_proposal_items add column if not exists created_todo_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_change_proposals_source_token_fkey'
      and conrelid = 'public.ai_change_proposals'::regclass
  ) then
    alter table public.ai_change_proposals
      add constraint ai_change_proposals_source_token_fkey
      foreign key (source_token_id) references public.integration_tokens(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_change_proposals_stable_id_key'
      and conrelid = 'public.ai_change_proposals'::regclass
  ) then
    alter table public.ai_change_proposals
      add constraint ai_change_proposals_stable_id_key unique (stable_id);
  end if;
end
$$;

create index if not exists mcp_request_logs_token_created_idx
  on public.mcp_request_logs(integration_token_id, created_at desc);

alter table public.mcp_request_logs enable row level security;
revoke all privileges on table public.mcp_request_logs from anon, authenticated, public;

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_todos_updated_at();

drop trigger if exists set_ai_memories_updated_at on public.ai_memories;
create trigger set_ai_memories_updated_at
before update on public.ai_memories
for each row execute function public.set_todos_updated_at();

-- 旧段落会重建该策略，因此在文件末尾把 AI 私有频道一并纳入。
drop policy if exists "Users can receive own todo broadcasts" on realtime.messages;
create policy "Users can receive own todo broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) in (
    'todos:' || (select auth.uid())::text,
    'todo-categories:' || (select auth.uid())::text,
    'todo-completion-goals:' || (select auth.uid())::text,
    'todo-completion-reviews:' || (select auth.uid())::text,
    'daily-reviews:' || (select auth.uid())::text,
    'work-reviews:' || (select auth.uid())::text,
    'ai-companion:' || (select auth.uid())::text
  )
);
