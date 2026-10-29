import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";
import { computeGaps } from "@/lib/gap";

const n = (v: number) => v.toFixed(1);

export default async function GapsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const profile = await supabase.from("career_profiles").select("id, target_career_id").maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.target_career_id) redirect("/onboarding");

  const target = await getTargetRequirements(profile.data.target_career_id);
  const claims = await supabase
    .from("user_skills")
    .select("skill_id, claimed_level")
    .eq("profile_id", profile.data.id);
  if (claims.error) throw new Error(claims.error.message);

  const { ranked, notAssessed } = computeGaps(target.skills, claims.data);
  const source = `Source: O*NET ${target.source.version}`;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{target.title} — your skill gaps</h1>
        <p className="text-sm">
          Based on U.S. O*NET occupational data. Required level = O*NET level ÷ 7 × 100; importance =
          (O*NET importance − 1) ÷ 4 × 100; weighted gap = max(0, required − your rating) × importance ÷ 100.
          Your ratings are self-reported and <strong>Unverified</strong>.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Ranked gaps ({ranked.length})</h2>
        {ranked.length === 0 ? (
          <p className="text-sm">
            You haven&apos;t rated any skills yet.{" "}
            <Link className="underline" href="/skills">
              Rate your skills
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-1">Skill</th>
                <th>Required</th>
                <th>You rated (unverified)</th>
                <th>Gap</th>
                <th>Importance</th>
                <th>Weighted gap</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.element_id} className="border-b">
                  <td className="py-1">
                    {r.skill_name}
                    {r.lowPrecision && <span className="text-xs"> (low precision)</span>}
                  </td>
                  <td>{n(r.required)}</td>
                  <td>{r.claimed}</td>
                  <td>{n(r.gap)}</td>
                  <td>{n(r.importance)}</td>
                  <td className="font-medium">{n(r.weightedGap)}</td>
                  <td className="text-xs">{source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Not assessed ({notAssessed.length})</h2>
        <p className="mb-2 text-sm">
          You haven&apos;t rated these, so there is no gap for them and they are not in the ranking.{" "}
          <Link className="underline" href="/skills">
            Rate them
          </Link>{" "}
          to include them.
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1">Skill</th>
              <th>Required</th>
              <th>Importance</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {notAssessed.map((r) => (
              <tr key={r.element_id} className="border-b">
                <td className="py-1">{r.skill_name}</td>
                <td>{n(r.required)}</td>
                <td>{n(r.importance)}</td>
                <td className="text-xs">{source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="text-xs">{target.source.attribution}</footer>
    </main>
  );
}
