import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";
import { groupClaims, type NamedClaim } from "@/lib/skills";

// Evidence label is derived from the stored evidence_type, never hard-coded to "Unverified".
const EVIDENCE_LABEL: Record<string, { text: string; className: string }> = {
  self_reported: { text: "Unverified", className: "bg-yellow-100 text-yellow-900" },
  ai_assessed: { text: "AI-assessed", className: "bg-blue-100 text-blue-900" },
  verified: { text: "Verified", className: "bg-green-100 text-green-900" },
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const profile = await supabase.from("career_profiles").select("id, target_career_id").maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.target_career_id) redirect("/onboarding");

  const target = await getTargetRequirements(profile.data.target_career_id);
  const claims = await supabase
    .from("user_skills")
    .select("skill_id, claimed_level, evidence_type")
    .eq("profile_id", profile.data.id);
  if (claims.error) throw new Error(claims.error.message);

  const { skills, tools } = groupClaims(claims.data, target.skills, target.techSkills);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">Career profile</h1>
      <p className="text-sm">Signed in as {auth.user.email}</p>
      <p>
        Target career: <strong>{target.title}</strong>{" "}
        <span className="text-sm">({target.soc})</span>
      </p>

      <section>
        <h2 className="text-lg font-semibold">Your claimed skills ({skills.length})</h2>
        {skills.length === 0 ? (
          <p className="text-sm">You haven&apos;t rated any skills yet.</p>
        ) : (
          <ClaimList rows={skills} />
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Tools ({tools.length})</h2>
        {tools.length === 0 ? (
          <p className="text-sm">You haven&apos;t claimed any tools yet.</p>
        ) : (
          <ClaimList rows={tools} />
        )}
      </section>

      <Link className="text-sm underline" href="/skills">
        Rate or edit your skills
      </Link>
      <Link className="text-sm underline" href="/gaps">
        See your skill gaps
      </Link>
      <Link className="text-sm underline" href="/requirements">
        See skill requirements
      </Link>
    </main>
  );
}

function ClaimList({ rows }: { rows: NamedClaim[] }) {
  return (
    <ul className="text-sm">
      {rows.map((r) => {
        const label = EVIDENCE_LABEL[r.evidence_type] ?? EVIDENCE_LABEL.self_reported;
        return (
          <li key={r.skill_id} className="flex items-center justify-between border-b py-1">
            <span>
              {r.name}
              {r.claimed_level !== null && <span> — you rated {r.claimed_level}</span>}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${label.className}`}>{label.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
