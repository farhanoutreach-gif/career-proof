// Turns the /skills form submission into changes. Pure, so it is unit-tested without a server.
//
// A claim is cleared only when the form says it was showing that claim (a `was` entry, rendered
// from the database when the page loaded) AND the field is now blank / the box is unticked.
// Claims that are simply absent from the submission are never touched, so a stale or partial
// form cannot delete anything the user did not explicitly clear.
export type SkillChanges = {
  set: { skill_id: string; claimed_level: number | null }[];
  clear: string[];
};

export function planSkillChanges(form: FormData, skillIds: Set<string>, techIds: Set<string>): SkillChanges {
  const set: SkillChanges["set"] = [];
  const present = new Set<string>();

  for (const id of skillIds) {
    const raw = form.get(`level:${id}`);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`Invalid rating for ${id}`);
    set.push({ skill_id: id, claimed_level: n });
    present.add(id);
  }
  for (const raw of form.getAll("tech")) {
    if (typeof raw !== "string" || !techIds.has(raw)) throw new Error("Unknown technology skill");
    set.push({ skill_id: raw, claimed_level: null });
    present.add(raw);
  }

  const clear: string[] = [];
  for (const raw of form.getAll("was")) {
    if (typeof raw !== "string" || !(skillIds.has(raw) || techIds.has(raw))) throw new Error("Unknown skill");
    if (!present.has(raw) && !clear.includes(raw)) clear.push(raw);
  }
  return { set, clear };
}
