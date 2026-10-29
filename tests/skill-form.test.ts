import { describe, it, expect } from "vitest";
import { planSkillChanges } from "../src/lib/skill-form";

const SQL = "2.E.6.f:Structured query language SQL";
const skills = new Set(["2.A.1.a", "2.A.1.b"]);
const tech = new Set([SQL, "2.E.6.f:Airtable"]);

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("planSkillChanges", () => {
  it("stale form: a form that never showed SQL as claimed cannot delete it", () => {
    // SQL was claimed elsewhere after this page loaded; this form shows it unticked and has no `was` for it.
    const plan = planSkillChanges(form([["was", "2.A.1.a"], ["level:2.A.1.a", "60"]]), skills, tech);
    expect(plan.clear).toEqual([]);
    expect(plan.set).toEqual([{ skill_id: "2.A.1.a", claimed_level: 60 }]);
  });

  it("claims absent from the submission (no `was`, no field) are untouched", () => {
    const plan = planSkillChanges(form([]), skills, tech);
    expect(plan).toEqual({ set: [], clear: [] });
  });

  it("explicitly unticking a tool that the form showed as claimed clears it", () => {
    const plan = planSkillChanges(form([["was", SQL], ["was", "2.E.6.f:Airtable"], ["tech", "2.E.6.f:Airtable"]]), skills, tech);
    expect(plan.clear).toEqual([SQL]);
    expect(plan.set).toEqual([{ skill_id: "2.E.6.f:Airtable", claimed_level: null }]);
  });

  it("explicitly blanking a rating that the form showed as claimed clears it", () => {
    const plan = planSkillChanges(form([["was", "2.A.1.a"], ["was", "2.A.1.b"], ["level:2.A.1.a", ""], ["level:2.A.1.b", "40"]]), skills, tech);
    expect(plan.clear).toEqual(["2.A.1.a"]);
    expect(plan.set).toEqual([{ skill_id: "2.A.1.b", claimed_level: 40 }]);
  });

  it("an explicit rating of 0 is kept, not cleared", () => {
    const plan = planSkillChanges(form([["was", "2.A.1.a"], ["level:2.A.1.a", "0"]]), skills, tech);
    expect(plan.clear).toEqual([]);
    expect(plan.set).toEqual([{ skill_id: "2.A.1.a", claimed_level: 0 }]);
  });

  it("ticking SQL sets it with a null level", () => {
    const plan = planSkillChanges(form([["tech", SQL]]), skills, tech);
    expect(plan.set).toEqual([{ skill_id: SQL, claimed_level: null }]);
  });

  it("rejects unknown ids, bad ratings and unknown `was` entries", () => {
    expect(() => planSkillChanges(form([["tech", "9.Z.9:Nope"]]), skills, tech)).toThrow();
    expect(() => planSkillChanges(form([["level:2.A.1.a", "101"]]), skills, tech)).toThrow();
    expect(() => planSkillChanges(form([["level:2.A.1.a", "5.5"]]), skills, tech)).toThrow();
    expect(() => planSkillChanges(form([["was", "9.Z.9:Nope"]]), skills, tech)).toThrow();
  });
});
