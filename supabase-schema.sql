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

create index if not exists todos_user_parent_position_idx
  on public.todos(user_id, parent_id, position);

create index if not exists todos_completed_idx
  on public.todos(is_completed);

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

alter table public.todos enable row level security;

revoke all privileges on table public.todos from anon;
revoke all privileges on table public.todos from public;
grant select, insert, update, delete on table public.todos to authenticated;

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

drop policy if exists "Users can receive own todo broadcasts" on realtime.messages;
create policy "Users can receive own todo broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'todos:' || (select auth.uid())::text
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
end
$$;
