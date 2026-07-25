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

-- 现有任务保持 NULL，并由客户端显示为不可删除的“未分组”。
alter table public.todos add column if not exists category_id uuid;

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

create index if not exists todo_categories_user_position_idx
  on public.todo_categories(user_id, position);

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

alter table public.todos enable row level security;
alter table public.todo_categories enable row level security;

revoke all privileges on table public.todos from anon;
revoke all privileges on table public.todos from public;
grant select, insert, update, delete on table public.todos to authenticated;
revoke all privileges on table public.todo_categories from anon;
revoke all privileges on table public.todo_categories from public;
grant select, insert, update, delete on table public.todo_categories to authenticated;

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

drop policy if exists "Users can receive own todo broadcasts" on realtime.messages;
create policy "Users can receive own todo broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) in (
    'todos:' || (select auth.uid())::text,
    'todo-categories:' || (select auth.uid())::text
  )
);

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
end
$$;
