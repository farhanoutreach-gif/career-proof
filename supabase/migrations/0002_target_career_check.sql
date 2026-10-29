-- v1: the only supported target career is Financial Analyst (O*NET SOC 13-2051.00).
-- Drop this constraint when multi-career selection ships.
alter table public.career_profiles
  add constraint career_profiles_target_career_v1
  check (target_career_id is null or target_career_id = '13-2051.00');
