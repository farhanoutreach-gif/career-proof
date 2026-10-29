import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";
import { TARGET_SOC } from "@/config/site";
import { setTargetCareer } from "./actions";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const target = await getTargetRequirements(TARGET_SOC);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Your target career</h1>
      <p>
        <strong>{target.title}</strong> <span className="text-sm">(O*NET {TARGET_SOC})</span>
      </p>
      <p className="text-sm">
        For now this is the one career we measure skills against, based on U.S. O*NET occupational
        data.
      </p>
      <form action={setTargetCareer}>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
