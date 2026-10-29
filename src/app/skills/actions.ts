"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";
import { techSkillId } from "@/lib/skills";
import { planSkillChanges } from "@/lib/skill-form";

// Saves self-assessed skills. Reachable by direct POST, so auth and every id/value are checked here.
// Only skill_id and claimed_level are sent: evidence_type stays at its column default
// ('self_reported'), and the column grants forbid clients from setting anything else.
// Claims are deleted only when the form explicitly cleared them (see planSkillChanges).
export async function saveSkills(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const profile = await supabase.from("career_profiles").select("id, target_career_id").maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.target_career_id) redirect("/onboarding");
  const profileId = profile.data.id;

  const target = await getTargetRequirements(profile.data.target_career_id);
  const skillIds = new Set(target.skills.filter((s) => !s.not_relevant).map((s) => s.element_id));
  const techIds = new Set(target.techSkills.map(techSkillId));
  const { set, clear } = planSkillChanges(formData, skillIds, techIds);

  // Insert new claims and update existing ones separately: an upsert would also try to
  // UPDATE profile_id, which clients have no grant for (and should not).
  const existing = await supabase.from("user_skills").select("skill_id").eq("profile_id", profileId);
  if (existing.error) throw new Error(existing.error.message);
  const have = new Set(existing.data.map((r) => r.skill_id));

  const inserts = set.filter((c) => !have.has(c.skill_id)).map((c) => ({ ...c, profile_id: profileId }));
  if (inserts.length) {
    const res = await supabase.from("user_skills").insert(inserts);
    if (res.error) throw new Error(res.error.message);
  }
  for (const c of set.filter((c) => have.has(c.skill_id))) {
    const res = await supabase
      .from("user_skills")
      .update({ claimed_level: c.claimed_level })
      .eq("profile_id", profileId)
      .eq("skill_id", c.skill_id);
    if (res.error) throw new Error(res.error.message);
  }

  // RLS only allows deleting self_reported rows.
  if (clear.length) {
    const del = await supabase.from("user_skills").delete().eq("profile_id", profileId).in("skill_id", clear);
    if (del.error) throw new Error(del.error.message);
  }

  redirect("/profile");
}
