-- 在现有 todos 表上启用 Supabase Auth 多用户隔离。
-- 在 Supabase SQL Editor 中完整执行本文件。
begin;

alter table public.todos
  add column if not exists user_id uuid;

alter table public.todos
  alter column user_id set default auth.uid();

-- 用户被删除时，一并删除该用户的任务。
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todos_user_id_fkey'
      and conrelid = 'public.todos'::regclass
  ) then
    alter table public.todos
      add constraint todos_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

-- 父子任务必须属于同一用户，避免跨用户挂载子任务。
alter table public.todos
  drop constraint if exists todos_parent_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todos_id_user_id_key'
      and conrelid = 'public.todos'::regclass
  ) then
    alter table public.todos
      add constraint todos_id_user_id_key unique (id, user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todos_parent_owner_fkey'
      and conrelid = 'public.todos'::regclass
  ) then
    alter table public.todos
      add constraint todos_parent_owner_fkey
      foreign key (parent_id, user_id)
      references public.todos(id, user_id)
      on delete cascade;
  end if;
end
$$;

create index if not exists todos_user_parent_position_idx
  on public.todos(user_id, parent_id, position);

alter table public.todos enable row level security;

-- 旧版本曾向 anon 授权；多用户版本只允许已登录角色访问。
revoke all privileges on table public.todos from anon;
revoke all privileges on table public.todos from public;
grant select, insert, update, delete on table public.todos to authenticated;

-- 清除 todos 上可能残留的宽松 Policy，避免多个 permissive Policy 通过 OR 放宽权限。
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'todos'
  loop
    execute format('drop policy %I on public.todos', policy_record.policyname);
  end loop;
end
$$;

create policy "Users can view own todos"
on public.todos
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own todos"
on public.todos
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own todos"
on public.todos
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own todos"
on public.todos
for delete
to authenticated
using (user_id = (select auth.uid()));

-- 使用私有 Broadcast 安全同步 INSERT / UPDATE / DELETE。
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
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'todos:' || (select auth.uid())::text
);

-- Postgres Changes 的 DELETE 无法按用户过滤，改用私有 Broadcast 后移出 publication。
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todos'
  ) then
    alter publication supabase_realtime drop table public.todos;
  end if;
end
$$;

commit;

-- 迁移前的公共任务会保留 user_id = null，并在 RLS 下对所有普通用户隐藏。
-- 若要把旧任务归给某个已注册用户，可在确认用户 UUID 后单独执行：
-- update public.todos set user_id = '用户 UUID' where user_id is null;
