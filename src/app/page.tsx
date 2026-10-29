import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/config/site";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const profile = await supabase.from("career_profiles").select("target_career_id").maybeSingle();
    if (profile.error) throw new Error(profile.error.message);
    redirect(profile.data?.target_career_id ? "/profile" : "/onboarding");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <Link className="text-sm underline" href="/login">
        Sign in / Sign up
      </Link>
    </main>
  );
}
