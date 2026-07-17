-- ============================================================
-- Phase 2 · Migration 4 — class-gated exam access
-- Students unlock the portal with a per-class invite link; access
-- runs until the class's expires_at (default: class day + 14 days,
-- editable per class). Admins always have access.
-- ============================================================

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- "Sake Server Class — Jul 16"
  class_date date not null,
  invite_code text unique not null,      -- short code in the shareable link
  expires_at timestamptz not null,       -- exam access ends here
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  joined_at timestamptz default now(),
  unique (user_id, class_id)
);

create index enrollments_user_idx on enrollments (user_id);
create index enrollments_class_idx on enrollments (class_id);

alter table classes     enable row level security;
alter table enrollments enable row level security;

-- classes: admins full CRUD; students see only classes they're enrolled in
create policy "classes_admin_all" on classes
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "classes_select_enrolled" on classes
  for select to authenticated
  using (exists (
    select 1 from enrollments e
    where e.class_id = classes.id and e.user_id = auth.uid()
  ));

-- enrollments: students see their own; admins see all.
-- No client insert policy — joining happens only through join_class().
create policy "enrollments_select_own_or_admin" on enrollments
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- ————— Join via invite code —————
create or replace function public.join_class(code text)
returns table (class_name text, expires_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
declare
  c classes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into c from classes
  where upper(invite_code) = upper(trim(code));
  if not found or not c.is_active then
    raise exception 'invalid_code';
  end if;
  if now() > c.expires_at then
    raise exception 'expired';
  end if;
  insert into enrollments (user_id, class_id)
  values (auth.uid(), c.id)
  on conflict (user_id, class_id) do nothing;
  return query select c.name, c.expires_at;
end;
$$;

revoke all on function public.join_class(text) from public;
grant execute on function public.join_class(text) to authenticated;

notify pgrst, 'reload schema';
