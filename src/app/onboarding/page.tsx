import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";
import { TARGET_SOC } from "@/config/site";
import { setTargetCareer, requestCareer } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { request } = await searchParams;
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

      <form action={requestCareer} className="mt-6 space-y-2 border-t pt-4">
        <label className="block text-sm" htmlFor="career">
          Targeting a different career? Tell us which one
        </label>
        <div className="flex gap-2">
          <input
            id="career"
            name="career"
            maxLength={200}
            required
            className="flex-1 rounded border px-2 py-1 text-sm"
          />
          <button className="rounded border px-3 py-1 text-sm" type="submit">
            Send
          </button>
        </div>
        {request === "saved" && <p className="text-sm">Thanks, we saved your request.</p>}
        {request === "invalid" && <p className="text-sm">Please enter 1 to 200 characters.</p>}
      </form>
    </main>
  );
}
