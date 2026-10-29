"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TARGET_SOC } from "@/config/site";

// Records the v1 target career on the signed-in user's career_profiles row,
// creating the row if it doesn't exist. Reachable by direct POST, so auth is checked here.
export async function setTargetCareer() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // RLS limits this to the caller's own row.
  const existing = await supabase.from("career_profiles").select("id").maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const res = existing.data
    ? await supabase
        .from("career_profiles")
        .update({ target_career_id: TARGET_SOC })
        .eq("id", existing.data.id)
    : await supabase
        .from("career_profiles")
        .insert({ target_career_id: TARGET_SOC, source: "manual" });
  if (res.error) throw new Error(res.error.message);

  redirect("/profile");
}
