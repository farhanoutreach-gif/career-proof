-- Skillmark 0006: users can tell us which other career they want (v1 target stays fixed).
-- Apply via Supabase Dashboard > SQL Editor.

create table public.career_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  career_text text not null check (char_length(btrim(career_text)) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.career_requests enable row level security;

revoke all on public.career_requests from anon, authenticated;
grant select on public.career_requests to authenticated;
grant insert (career_text) on public.career_requests to authenticated;

create policy career_requests_select_own on public.career_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy career_requests_insert_own on public.career_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
