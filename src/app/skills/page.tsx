import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements, getLevelAnchors, type LevelAnchor, type SkillRequirement } from "@/lib/onet";
import { groupTechSkills, rankedRelevantSkills, techSkillId } from "@/lib/skills";
import { levelTo100 } from "@/lib/gap";
import { saveSkills } from "./actions";

export default async function SkillsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const profile = await supabase.from("career_profiles").select("id, target_career_id").maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.target_career_id) redirect("/onboarding");

  const target = await getTargetRequirements(profile.data.target_career_id);
  const anchors = await getLevelAnchors(target.source.version);
  const claims = await supabase
    .from("user_skills")
    .select("skill_id, claimed_level")
    .eq("profile_id", profile.data.id);
  if (claims.error) throw new Error(claims.error.message);
  const claimed = new Map(claims.data.map((c) => [c.skill_id, c.claimed_level as number | null]));

  const { top, rest } = rankedRelevantSkills(target.skills);
  const tech = groupTechSkills(target.techSkills);
  const version = target.source.version;

  const skillInput = (s: SkillRequirement) => (
    <li key={s.element_id} className="space-y-1 border-b py-3">
      <label className="flex items-center justify-between gap-4" htmlFor={`level:${s.element_id}`}>
        <span className="font-medium">{s.skill_name}</span>
        <input
          id={`level:${s.element_id}`}
          name={`level:${s.element_id}`}
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={claimed.get(s.element_id) ?? ""}
          placeholder="0–100"
          className="w-24 rounded border px-2 py-1"
        />
      </label>
      <AnchorHints anchors={anchors[s.element_id] ?? []} version={version} />
    </li>
  );

  const techInput = (t: (typeof target.techSkills)[number]) => {
    const id = techSkillId(t);
    return (
      <li key={id}>
        <label className="flex items-center gap-2 py-1">
          <input type="checkbox" name="tech" value={id} defaultChecked={claimed.has(id)} />
          <span>{t.example_name}</span>
          {t.hot_technology && <span className="rounded bg-orange-100 px-1 text-xs">Hot Technology</span>}
          {t.in_demand && <span className="rounded bg-blue-100 px-1 text-xs">In Demand</span>}
        </label>
      </li>
    );
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Rate your skills — {target.title}</h1>
        <p className="text-sm">
          Rate yourself 0–100 on each skill. These are your own claims and stay <strong>Unverified</strong>{" "}
          until you prove them with a challenge. Leave a skill blank to skip it. Skills are ordered by
          importance for this career, based on U.S. O*NET occupational data (Source: O*NET {version}).
        </p>
      </header>

      <form action={saveSkills} className="space-y-8">
        {/* Claims this page was showing. Only these can be cleared by this form (see planSkillChanges). */}
        {[...claimed.keys()].map((id) => (
          <input key={id} type="hidden" name="was" value={id} />
        ))}
        <section>
          <h2 className="text-lg font-semibold">Most important skills</h2>
          <ul>{top.map(skillInput)}</ul>
        </section>

        <details>
          <summary className="cursor-pointer text-lg font-semibold">
            More skills, optional ({rest.length})
          </summary>
          <ul>{rest.map(skillInput)}</ul>
        </details>

        <section>
          <h2 className="text-lg font-semibold">Tools and technologies you can use</h2>
          <p className="mb-2 text-sm">
            Tick the ones you claim. No level is needed, and they are not part of the gap calculation.
          </p>
          <ul>{tech.featured.map(techInput)}</ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium">More tools ({tech.more.length})</summary>
            <ul>{tech.more.map(techInput)}</ul>
          </details>
        </section>

        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Save my skills
        </button>
      </form>

      <footer className="text-xs">{target.source.attribution}</footer>
    </main>
  );
}

function AnchorHints({ anchors, version }: { anchors: LevelAnchor[]; version: string }) {
  if (!anchors.length) return null;
  return (
    <div className="text-xs text-gray-600">
      <p>O*NET example tasks on its 0–7 scale (approximate position on the 0–100 input), Source: O*NET {version}:</p>
      <ul className="ml-4 list-disc">
        {anchors.map((a) => (
          <li key={a.anchor_value}>
            Level {a.anchor_value} (≈{Math.round(levelTo100(a.anchor_value))}): {a.anchor_description}
          </li>
        ))}
      </ul>
    </div>
  );
}
