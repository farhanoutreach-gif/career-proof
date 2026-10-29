import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetRequirements } from "@/lib/onet";
import { TARGET_SOC } from "@/config/site";

export default async function RequirementsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { title, soc, source, skills, techSkills } = await getTargetRequirements(TARGET_SOC);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{title} — skill requirements</h1>
        <p className="text-sm">
          Based on U.S. O*NET occupational data. Source: O*NET {source.version} ({soc}). Importance
          is rated 1–5 and level 0–7, as published by O*NET.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Skills ({skills.length})</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1">Skill</th>
              <th>ID</th>
              <th>Importance</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s.element_id} className="border-b">
                <td className="py-1">{s.skill_name}</td>
                <td>{s.element_id}</td>
                <td>{s.importance}</td>
                <td>
                  {s.level}
                  {s.not_relevant && " (O*NET marks this skill not relevant)"}
                  {(s.importance_suppressed || s.level_suppressed) && " (low precision)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Technology skills ({techSkills.length})</h2>
        <p className="mb-2 text-sm">
          O*NET technology examples have no importance or level and are not used in skill-gap
          scores.
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1">Example</th>
              <th>Category</th>
              <th>Hot Technology</th>
              <th>In Demand</th>
            </tr>
          </thead>
          <tbody>
            {techSkills.map((t) => (
              <tr key={`${t.example_name}|${t.category_element_id}`} className="border-b">
                <td className="py-1">{t.example_name}</td>
                <td>
                  {t.category_name} ({t.category_element_id})
                </td>
                <td>{t.hot_technology ? "Yes" : "No"}</td>
                <td>{t.in_demand ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="text-xs">
        <p>
          {source.attribution} {source.modified_notice}
        </p>
        <p>
          Source: O*NET {source.version}, {source.license}.
        </p>
      </footer>
    </main>
  );
}
