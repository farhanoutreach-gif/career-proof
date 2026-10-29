-- Skillmark 0001: core tables, RLS, and column-level privileges.
-- Apply via Supabase Dashboard > SQL Editor.

create table public.career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  current_stage text,              -- student / early-career / switcher
  target_career_id text,           -- O*NET SOC code
  source text,                     -- resume-built / resume-uploaded / manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.user_skills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.career_profiles on delete cascade,
  skill_id text not null,                      -- O*NET skill/tech reference
  claimed_level int check (claimed_level between 0 and 100),
  evidence_type text not null default 'self_reported'
    check (evidence_type in ('self_reported','ai_assessed','verified')),
  evidence_score int check (evidence_score between 0 and 100),
  evidence_source text,                        -- challenge_id, or 'user_claim'
  verified_at timestamptz,
  user_confirmed_include boolean not null default false,
  unique (profile_id, skill_id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null,
  type text not null check (type in ('deterministic','rubric')),
  grading_spec jsonb not null
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges,
  profile_id uuid not null references public.career_profiles on delete cascade,
  result_score int check (result_score between 0 and 100),
  result_detail jsonb,
  created_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger career_profiles_touch
  before update on public.career_profiles
  for each row execute function public.touch_updated_at();

-- RLS on every table
alter table public.career_profiles enable row level security;
alter table public.user_skills     enable row level security;
alter table public.challenges      enable row level security;
alter table public.submissions     enable row level security;

-- Supabase auto-grants ALL to anon/authenticated on new tables, and a column
-- grant cannot narrow a table-level grant. So revoke everything, then grant
-- only the columns clients may touch. service_role bypasses RLS and keeps access.
revoke all on public.career_profiles, public.user_skills,
              public.challenges, public.submissions
  from anon, authenticated;

-- career_profiles: own row only
grant select on public.career_profiles to authenticated;
grant insert (current_stage, target_career_id, source) on public.career_profiles to authenticated;
grant update (current_stage, target_career_id, source) on public.career_profiles to authenticated;

create policy profiles_select_own on public.career_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert_own on public.career_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update_own on public.career_profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- user_skills: clients cannot write evidence_type/score/source/verified_at.
grant select on public.user_skills to authenticated;
grant insert (profile_id, skill_id, claimed_level, user_confirmed_include)
  on public.user_skills to authenticated;
grant update (claimed_level, user_confirmed_include) on public.user_skills to authenticated;
grant delete on public.user_skills to authenticated;

create policy skills_select_own on public.user_skills
  for select to authenticated using (
    profile_id in (select id from public.career_profiles where user_id = (select auth.uid())));
create policy skills_insert_own on public.user_skills
  for insert to authenticated with check (
    profile_id in (select id from public.career_profiles where user_id = (select auth.uid())));
create policy skills_update_own on public.user_skills
  for update to authenticated
  using (profile_id in (select id from public.career_profiles where user_id = (select auth.uid())))
  with check (profile_id in (select id from public.career_profiles where user_id = (select auth.uid())));
create policy skills_delete_own_unproven on public.user_skills
  for delete to authenticated using (
    evidence_type = 'self_reported'
    and profile_id in (select id from public.career_profiles where user_id = (select auth.uid())));

-- challenges: readable, but grading_spec (expected output / rubric) is not.
grant select (id, skill_id, type) on public.challenges to authenticated;
create policy challenges_select_all on public.challenges
  for select to authenticated using (true);

-- submissions: own rows readable; written only by the service role.
grant select on public.submissions to authenticated;
create policy submissions_select_own on public.submissions
  for select to authenticated using (
    profile_id in (select id from public.career_profiles where user_id = (select auth.uid())));
