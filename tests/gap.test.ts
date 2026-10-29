import { describe, it, expect } from "vitest";
import { computeGaps } from "../src/lib/gap";
import { rankedRelevantSkills, groupTechSkills, groupClaims, SQL_SKILL_ID } from "../src/lib/skills";

const base = { importance_suppressed: false, level_suppressed: false, not_relevant: false };
const req = (element_id: string, importance: number, level: number, extra = {}) => ({
  element_id, skill_name: `Skill ${element_id}`, importance, level, ...base, ...extra,
});

// Hand calculation (required = LV/7*100, importance = (IM-1)/4*100,
// gap = max(0, required - claimed), weighted = gap * importance / 100):
//
// id  IM  LV    claimed | required  importance  gap      weighted
// B   5   7     0       | 100       100         100      100
// A   4   3.5   20      | 50        75          30       22.5
// H   4   4.25  40      | 60.7143   75          20.7143  15.5357   (4.25/7 = 0.6071428..., x0.75)
// D   2   2.8   10      | 40        25          30       7.5
// G   2   2.8   10      | 40        25          30       7.5       (tie with D -> element_id order)
// C   3   5.6   90      | 80        50          0        0         (claimed above required -> 0)
// E   3.5 3     (none)  | -> notAssessed, no gap
// F   1   0     50      | Not Relevant -> excluded even though the user rated it
const requirements = [
  req("A", 4, 3.5), req("B", 5, 7), req("C", 3, 5.6), req("D", 2, 2.8),
  req("E", 3.5, 3), req("F", 1, 0, { not_relevant: true }), req("G", 2, 2.8), req("H", 4, 4.25),
];
const claims = [
  { skill_id: "A", claimed_level: 20 },
  { skill_id: "B", claimed_level: 0 },
  { skill_id: "C", claimed_level: 90 },
  { skill_id: "D", claimed_level: 10 },
  { skill_id: "F", claimed_level: 50 },
  { skill_id: "G", claimed_level: 10 },
  { skill_id: "H", claimed_level: 40 },
  // tech claim: null level, never part of gap math
  { skill_id: "2.E.6.f:Structured query language SQL", claimed_level: null },
];

describe("computeGaps (hand-calculated)", () => {
  const { ranked, notAssessed } = computeGaps(requirements, claims);

  it("ranks only rated, relevant skills by weighted gap, ties by element_id", () => {
    expect(ranked.map((r) => r.element_id)).toEqual(["B", "A", "H", "D", "G", "C"]);
  });

  it("matches the hand-calculated numbers", () => {
    const by = Object.fromEntries(ranked.map((r) => [r.element_id, r]));
    expect(by.B.required).toBeCloseTo(100, 6);
    expect(by.B.importance).toBeCloseTo(100, 6);
    expect(by.B.gap).toBeCloseTo(100, 6);
    expect(by.B.weightedGap).toBeCloseTo(100, 6);

    expect(by.A.required).toBeCloseTo(50, 6);
    expect(by.A.importance).toBeCloseTo(75, 6);
    expect(by.A.gap).toBeCloseTo(30, 6);
    expect(by.A.weightedGap).toBeCloseTo(22.5, 6);

    expect(by.H.required).toBeCloseTo(60.7142857, 5);
    expect(by.H.gap).toBeCloseTo(20.7142857, 5);
    expect(by.H.weightedGap).toBeCloseTo(15.5357143, 5);

    expect(by.D.weightedGap).toBeCloseTo(7.5, 6);
    expect(by.G.weightedGap).toBeCloseTo(7.5, 6);
  });

  it("gives gap 0 when the claim exceeds the requirement", () => {
    const c = ranked.find((r) => r.element_id === "C")!;
    expect(c.gap).toBe(0);
    expect(c.weightedGap).toBe(0);
  });

  it("puts unrated skills in notAssessed with no gap, not counted as 0", () => {
    expect(notAssessed.map((n) => n.element_id)).toEqual(["E"]);
    expect(notAssessed[0]).not.toHaveProperty("gap");
    expect(notAssessed[0].required).toBeCloseTo((3 / 7) * 100, 6); // 42.857...
    expect(notAssessed[0].importance).toBeCloseTo(62.5, 6); // (3.5-1)/4*100
    expect(ranked.some((r) => r.element_id === "E")).toBe(false);
  });

  it("excludes Not Relevant skills from both lists even if rated", () => {
    expect([...ranked, ...notAssessed].some((r) => r.element_id === "F")).toBe(false);
  });

  it("treats an explicit rating of 0 as rated (full gap)", () => {
    expect(ranked.find((r) => r.element_id === "B")!.claimed).toBe(0);
  });

  it("ignores tech-skill claims entirely", () => {
    expect(ranked.length + notAssessed.length).toBe(7);
  });
});

describe("skills helpers", () => {
  it("drops Not Relevant skills and breaks importance ties by element_id", () => {
    const { top, rest } = rankedRelevantSkills([
      req("2", 3, 1), req("1", 3, 1), req("9", 1, 0, { not_relevant: true }), req("3", 4, 1),
    ]);
    expect([...top, ...rest].map((s) => s.element_id)).toEqual(["3", "1", "2"]);
  });

  it("splits at 10", () => {
    const many = Array.from({ length: 14 }, (_, i) => req(String(i).padStart(2, "0"), 3, 1));
    const { top, rest } = rankedRelevantSkills(many);
    expect([top.length, rest.length]).toEqual([10, 4]);
  });

  it("puts SQL first, then hot/in-demand, and the rest under more", () => {
    const t = (example_name: string, hot: boolean, dem: boolean, cat = "2.E.6.f") => ({
      example_name, category_element_id: cat, category_name: "x", hot_technology: hot, in_demand: dem,
    });
    const { featured, more } = groupTechSkills([
      t("Airtable", false, false), t("Zeta", true, false), t("Structured query language SQL", true, true),
      t("Alpha", false, true),
    ]);
    expect(`${featured[0].category_element_id}:${featured[0].example_name}`).toBe(SQL_SKILL_ID);
    expect(featured.map((x) => x.example_name)).toEqual(["Structured query language SQL", "Alpha", "Zeta"]);
    expect(more.map((x) => x.example_name)).toEqual(["Airtable"]);
  });
});

describe("groupClaims (profile lists)", () => {
  const skills = [req("A", 3, 1), req("B", 3, 1)];
  const tech = [
    { example_name: "Structured query language SQL", category_element_id: "2.E.6.f", category_name: "x", hot_technology: true, in_demand: true },
    { example_name: "Airtable", category_element_id: "2.E.6.f", category_name: "x", hot_technology: false, in_demand: false },
  ];

  it("lists a null-level SQL claim under tools as self_reported, not under skills", () => {
    const { skills: s, tools } = groupClaims(
      [
        { skill_id: "B", claimed_level: 40, evidence_type: "self_reported" },
        { skill_id: SQL_SKILL_ID, claimed_level: null, evidence_type: "self_reported" },
        { skill_id: "A", claimed_level: 0, evidence_type: "self_reported" },
      ],
      skills,
      tech,
    );
    expect(tools).toEqual([
      { skill_id: SQL_SKILL_ID, claimed_level: null, evidence_type: "self_reported", name: "Structured query language SQL" },
    ]);
    expect(s.map((x) => x.skill_id)).toEqual(["A", "B"]);
  });

  it("returns empty lists when nothing is claimed, and sorts tools by name", () => {
    expect(groupClaims([], skills, tech)).toEqual({ skills: [], tools: [] });
    const { tools } = groupClaims(
      [
        { skill_id: SQL_SKILL_ID, claimed_level: null, evidence_type: "self_reported" },
        { skill_id: "2.E.6.f:Airtable", claimed_level: null, evidence_type: "self_reported" },
      ],
      skills,
      tech,
    );
    expect(tools.map((x) => x.name)).toEqual(["Airtable", "Structured query language SQL"]);
  });
});
