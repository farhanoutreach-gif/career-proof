import type { SkillRequirement, TechSkill } from "@/lib/onet";

export const TOP_SKILL_COUNT = 10;
// SQL must always be claimable and shown first (CLAUDE.md Task 9).
export const SQL_SKILL_ID = "2.E.6.f:Structured query language SQL";

export const techSkillId = (t: Pick<TechSkill, "category_element_id" | "example_name">) =>
  `${t.category_element_id}:${t.example_name}`;

// Relevant skills by O*NET importance desc (ties by element_id). Not Relevant skills are dropped.
export function rankedRelevantSkills(skills: SkillRequirement[]) {
  const ranked = skills
    .filter((s) => !s.not_relevant)
    .sort((a, b) => b.importance - a.importance || a.element_id.localeCompare(b.element_id));
  return { top: ranked.slice(0, TOP_SKILL_COUNT), rest: ranked.slice(TOP_SKILL_COUNT) };
}

// SQL first, then Hot Technology / In Demand (shown up front), everything else under "More tools".
export function groupTechSkills(tech: TechSkill[]) {
  const byName = (a: TechSkill, b: TechSkill) => a.example_name.localeCompare(b.example_name);
  const sql = tech.filter((t) => techSkillId(t) === SQL_SKILL_ID);
  const featured = tech
    .filter((t) => techSkillId(t) !== SQL_SKILL_ID && (t.hot_technology || t.in_demand))
    .sort(byName);
  const more = tech.filter((t) => techSkillId(t) !== SQL_SKILL_ID && !t.hot_technology && !t.in_demand).sort(byName);
  return { featured: [...sql, ...featured], more };
}

export type ClaimRow = { skill_id: string; claimed_level: number | null; evidence_type: string };
export type NamedClaim = ClaimRow & { name: string };

// Splits a profile's claims into rated O*NET skills and checkbox-only tools, each sorted by name.
// A claim is a tool if its id is one of the target's technology skills; anything else is a skill.
export function groupClaims(claims: ClaimRow[], skills: SkillRequirement[], tech: TechSkill[]) {
  const skillNames = new Map(skills.map((s) => [s.element_id, s.skill_name]));
  const toolNames = new Map(tech.map((t) => [techSkillId(t), t.example_name]));
  const byName = (a: NamedClaim, b: NamedClaim) => a.name.localeCompare(b.name);
  const out = { skills: [] as NamedClaim[], tools: [] as NamedClaim[] };
  for (const c of claims) {
    const tool = toolNames.get(c.skill_id);
    if (tool !== undefined) out.tools.push({ ...c, name: tool });
    else out.skills.push({ ...c, name: skillNames.get(c.skill_id) ?? c.skill_id });
  }
  out.skills.sort(byName);
  out.tools.sort(byName);
  return out;
}
