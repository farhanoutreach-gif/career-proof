-- v1 target career moves from 13-2051.00 to 15-2051.01 (Business Intelligence Analysts):
-- O*NET 31.0 has no skill ratings for 13-2051.00, so it cannot back the skill-gap math.
-- Title comes from O*NET occupation_data (see onet_occupations, migration 0004).
-- Drop this constraint when multi-career selection ships.
alter table public.career_profiles drop constraint career_profiles_target_career_v1;

-- Any profile already pointing at the old code is cleared; users re-pick it in onboarding.
update public.career_profiles set target_career_id = null where target_career_id = '13-2051.00';

alter table public.career_profiles
  add constraint career_profiles_target_career_v1
  check (target_career_id is null or target_career_id = '15-2051.01');
