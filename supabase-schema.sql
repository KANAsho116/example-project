-- Run this once in the Supabase SQL Editor for the Futari board.
-- The app only receives SELECT access; authenticated RPCs enforce membership
-- before creating boards, joining by invite code, or changing tasks.

create table if not exists public.futari_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.futari_board_members (
  board_id uuid not null references public.futari_boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.futari_tasks (
  board_id uuid not null references public.futari_boards(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 90),
  description text not null default '' check (char_length(description) <= 240),
  owner text not null default '' check (owner in ('', 'dev-a', 'dev-b')),
  status text not null default 'backlog' check (status in ('backlog', 'progress', 'done')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_date date,
  labels text[] not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (board_id, id),
  check (cardinality(labels) <= 8),
  check (array_position(labels, null) is null)
);

create or replace function public.futari_is_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.futari_board_members as member_row
    where member_row.board_id = p_board_id
      and member_row.user_id = (select auth.uid())
  );
$$;

create or replace function public.futari_create_board(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_board_id uuid := gen_random_uuid();
  new_invite_code text := replace(gen_random_uuid()::text, '-', '');
  clean_name text := trim(p_name);
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before creating a board';
  end if;
  if char_length(clean_name) not between 1 and 60 then
    raise exception 'Board name must be between 1 and 60 characters';
  end if;

  insert into public.futari_boards (id, name, invite_code, created_by)
  values (new_board_id, clean_name, new_invite_code, (select auth.uid()));
  insert into public.futari_board_members (board_id, user_id, role)
  values (new_board_id, (select auth.uid()), 'owner');

  return jsonb_build_object('id', new_board_id, 'name', clean_name, 'invite_code', new_invite_code);
end;
$$;

create or replace function public.futari_join_board(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_board_id uuid;
  normalized_code text := regexp_replace(lower(trim(p_invite_code)), '[^0-9a-f]', '', 'g');
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before joining a board';
  end if;

  select board_row.id into target_board_id
  from public.futari_boards as board_row
  where board_row.invite_code = normalized_code;
  if target_board_id is null then
    raise exception 'Invite code is invalid';
  end if;

  insert into public.futari_board_members (board_id, user_id, role)
  values (target_board_id, (select auth.uid()), 'member')
  on conflict (board_id, user_id) do nothing;
  return target_board_id;
end;
$$;

create or replace function public.futari_rotate_invite_code(p_board_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invite_code text := replace(gen_random_uuid()::text, '-', '');
begin
  if not exists (
    select 1 from public.futari_board_members as member_row
    where member_row.board_id = p_board_id
      and member_row.user_id = (select auth.uid())
      and member_row.role = 'owner'
  ) then
    raise exception 'Only a board owner can rotate its invite code';
  end if;

  update public.futari_boards
  set invite_code = new_invite_code
  where id = p_board_id;
  return new_invite_code;
end;
$$;

create or replace function public.futari_apply_task_changes(
  p_board_id uuid,
  p_upserts jsonb default '[]'::jsonb,
  p_deleted_ids text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.futari_is_board_member(p_board_id) then
    raise exception 'You are not a member of this board';
  end if;

  delete from public.futari_tasks
  where board_id = p_board_id and id = any(coalesce(p_deleted_ids, '{}'::text[]));

  insert into public.futari_tasks (
    board_id, id, title, description, owner, status, priority, due_date, labels, created_by, updated_at
  )
  select
    p_board_id,
    row_data.id,
    btrim(row_data.title),
    coalesce(row_data.description, ''),
    coalesce(row_data.owner, ''),
    coalesce(row_data.status, 'backlog'),
    coalesce(row_data.priority, 'medium'),
    nullif(row_data.due_date, '')::date,
    coalesce(row_data.labels, '{}'::text[]),
    (select auth.uid()),
    now()
  from jsonb_to_recordset(coalesce(p_upserts, '[]'::jsonb)) as row_data(
    id text,
    title text,
    description text,
    owner text,
    status text,
    priority text,
    due_date text,
    labels text[]
  )
  on conflict (board_id, id) do update set
    title = excluded.title,
    description = excluded.description,
    owner = excluded.owner,
    status = excluded.status,
    priority = excluded.priority,
    due_date = excluded.due_date,
    labels = excluded.labels,
    updated_at = now();
end;
$$;

alter table public.futari_boards enable row level security;
alter table public.futari_board_members enable row level security;
alter table public.futari_tasks enable row level security;

drop policy if exists "futari members can read boards" on public.futari_boards;
create policy "futari members can read boards"
  on public.futari_boards for select to authenticated
  using (public.futari_is_board_member(id));

drop policy if exists "futari members can read memberships" on public.futari_board_members;
create policy "futari members can read memberships"
  on public.futari_board_members for select to authenticated
  using (public.futari_is_board_member(board_id));

drop policy if exists "futari members can read tasks" on public.futari_tasks;
create policy "futari members can read tasks"
  on public.futari_tasks for select to authenticated
  using (public.futari_is_board_member(board_id));

revoke all on public.futari_boards, public.futari_board_members, public.futari_tasks from anon, authenticated;
grant usage on schema public to authenticated;
grant select (id, name, created_at) on public.futari_boards to authenticated;
grant select on public.futari_tasks to authenticated;

revoke all on function public.futari_is_board_member(uuid) from public, anon;
revoke all on function public.futari_create_board(text) from public, anon;
revoke all on function public.futari_join_board(text) from public, anon;
revoke all on function public.futari_rotate_invite_code(uuid) from public, anon;
revoke all on function public.futari_apply_task_changes(uuid, jsonb, text[]) from public, anon;
grant execute on function public.futari_is_board_member(uuid) to authenticated;
grant execute on function public.futari_create_board(text) to authenticated;
grant execute on function public.futari_join_board(text) to authenticated;
grant execute on function public.futari_rotate_invite_code(uuid) to authenticated;
grant execute on function public.futari_apply_task_changes(uuid, jsonb, text[]) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'futari_tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.futari_tasks';
  end if;
end;
$$;
