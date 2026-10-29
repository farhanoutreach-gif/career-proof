// Skill-gap math. Pure: no I/O, no rounding (round only when displaying).
//   required   = O*NET level (0-7) / 7 * 100
//   importance = (O*NET importance (1-5) - 1) / 4 * 100
//   gap        = max(0, required - claimed)
//   weighted   = gap * importance / 100
// Only skills the user actually rated get a gap. Unrated skills go to `notAssessed`.
// Skills O*NET marks Not Relevant are excluded entirely. Tech skills never enter.
import type { SkillRequirement } from "@/lib/onet";

export type Claim = { skill_id: string; claimed_level: number | null };

export type GapRow = {
  element_id: string;
  skill_name: string;
  required: number;
  importance: number;
  claimed: number;
  gap: number;
  weightedGap: number;
  lowPrecision: boolean;
};

export type NotAssessedRow = {
  element_id: string;
  skill_name: string;
  required: number;
  importance: number;
  lowPrecision: boolean;
};

export const levelTo100 = (lv: number) => (lv / 7) * 100;
export const importanceTo100 = (im: number) => ((im - 1) / 4) * 100;

export function computeGaps(
  requirements: SkillRequirement[],
  claims: Claim[],
): { ranked: GapRow[]; notAssessed: NotAssessedRow[] } {
  const rated = new Map<string, number>();
  for (const c of claims) if (c.claimed_level !== null) rated.set(c.skill_id, c.claimed_level);

  const ranked: GapRow[] = [];
  const notAssessed: NotAssessedRow[] = [];
  for (const s of requirements) {
    if (s.not_relevant) continue;
    const required = levelTo100(s.level);
    const importance = importanceTo100(s.importance);
    const lowPrecision = s.importance_suppressed || s.level_suppressed;
    const claimed = rated.get(s.element_id);
    if (claimed === undefined) {
      notAssessed.push({ element_id: s.element_id, skill_name: s.skill_name, required, importance, lowPrecision });
      continue;
    }
    const gap = Math.max(0, required - claimed);
    ranked.push({
      element_id: s.element_id,
      skill_name: s.skill_name,
      required,
      importance,
      claimed,
      gap,
      weightedGap: (gap * importance) / 100,
      lowPrecision,
    });
  }
  ranked.sort((a, b) => b.weightedGap - a.weightedGap || a.element_id.localeCompare(b.element_id));
  notAssessed.sort((a, b) => b.importance - a.importance || a.element_id.localeCompare(b.element_id));
  return { ranked, notAssessed };
}
