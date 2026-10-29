import { createClient } from "@/lib/supabase/server";

export type OnetSource = {
  version: string;
  license: string;
  attribution: string;
  modified_notice: string;
  source_url: string;
};

export type SkillRequirement = {
  element_id: string;
  skill_name: string;
  importance: number;
  level: number;
  importance_suppressed: boolean;
  level_suppressed: boolean;
  not_relevant: boolean;
};

export type TechSkill = {
  example_name: string;
  category_element_id: string;
  category_name: string;
  hot_technology: boolean;
  in_demand: boolean;
};

export type TargetRequirements = {
  soc: string;
  title: string;
  source: OnetSource;
  skills: SkillRequirement[];
  techSkills: TechSkill[];
};

// Returns the requirements for the occupation's newest imported O*NET version.
export async function getTargetRequirements(soc: string): Promise<TargetRequirements> {
  const supabase = await createClient();

  const occ = await supabase
    .from("onet_occupations")
    .select("title, onet_version")
    .eq("soc_code", soc)
    .order("onet_version", { ascending: false })
    .limit(1)
    .single();
  if (occ.error) throw new Error(`O*NET occupation ${soc} not found: ${occ.error.message}`);
  const version = occ.data.onet_version;

  const [source, skills, tech] = await Promise.all([
    supabase.from("onet_sources").select("*").eq("version", version).single(),
    supabase
      .from("onet_skill_requirements")
      .select("element_id, skill_name, importance, level, importance_suppressed, level_suppressed, not_relevant")
      .eq("soc_code", soc)
      .eq("onet_version", version)
      .order("importance", { ascending: false })
      .order("element_id"),
    supabase
      .from("onet_tech_skills")
      .select("example_name, category_element_id, category_name, hot_technology, in_demand")
      .eq("soc_code", soc)
      .eq("onet_version", version)
      .order("in_demand", { ascending: false })
      .order("hot_technology", { ascending: false })
      .order("example_name"),
  ]);
  if (source.error) throw new Error(`O*NET source ${version}: ${source.error.message}`);
  if (skills.error) throw new Error(`O*NET skills: ${skills.error.message}`);
  if (tech.error) throw new Error(`O*NET tech skills: ${tech.error.message}`);

  return {
    soc,
    title: occ.data.title,
    source: source.data,
    skills: skills.data as SkillRequirement[],
    techSkills: tech.data as TechSkill[],
  };
}
