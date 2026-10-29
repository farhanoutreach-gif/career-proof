import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const profile = await supabase.from("career_profiles").select("target_career_id").maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.target_career_id) redirect("/onboarding");

  const target = await getTargetRequirements(profile.data.target_career_id);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">Career profile</h1>
      <p className="text-sm">Signed in as {auth.user.email}</p>
      <p>
        Target career: <strong>{target.title}</strong>{" "}
        <span className="text-sm">({target.soc})</span>
      </p>
      <Link className="text-sm underline" href="/requirements">
        See skill requirements
      </Link>
    </main>
  );
}
