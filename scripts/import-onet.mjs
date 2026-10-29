// Generates data/onet/<soc>.json and supabase/migrations/0004_onet_<soc>.sql from the
// official O*NET CSV database files. No value is typed by hand; everything is read from disk.
//
// Usage: node scripts/import-onet.mjs <dir-with-onet-csvs> <soc-code> <onet-version>
//   e.g. node scripts/import-onet.mjs ./onet31 15-2051.01 31.0
//
// Source: https://www.onetcenter.org/dl_files/database/db_<version>_csv/<file>.csv
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [dir, soc, version] = process.argv.slice(2);
if (!dir || !soc || !version) {
  console.error("usage: node scripts/import-onet.mjs <dir> <soc-code> <onet-version>");
  process.exit(1);
}

const SOURCE_BASE = `https://www.onetcenter.org/dl_files/database/db_${version.replace(".", "_")}_csv`;
const FILES = [
  "occupation_data.csv",
  "content_model_reference.csv",
  "scales_reference.csv",
  "essential_skills.csv",
  "transferable_skills.csv",
  "software_skills.csv",
];
// Exact headers we rely on. If O*NET renames anything, fail instead of guessing.
const EXPECTED_HEADERS = {
  "occupation_data.csv": ["O*NET-SOC Code", "Title", "Description"],
  "content_model_reference.csv": ["Element ID", "Element Name", "Description"],
  "scales_reference.csv": ["Scale ID", "Scale Name", "Minimum", "Maximum"],
  "essential_skills.csv": [
    "O*NET-SOC Code", "Title", "Element ID", "Element Name", "Scale ID", "Scale Name",
    "Data Value", "N", "Standard Error", "Lower CI Bound", "Upper CI Bound",
    "Recommend Suppress", "Not Relevant", "Date", "Domain Source",
  ],
  "software_skills.csv": [
    "O*NET-SOC Code", "Title", "Workplace Example", "Element ID", "Element Name",
    "Hot Technology", "In Demand",
  ],
};
EXPECTED_HEADERS["transferable_skills.csv"] = EXPECTED_HEADERS["essential_skills.csv"];

// Attribution copied from https://www.onetcenter.org/database.html (CC BY 4.0 credit line,
// plus the "modified" variant since we filter and reshape the data).
const ATTRIBUTION =
  `This page includes information from the O*NET ${version} Database by the U.S. Department of Labor, ` +
  `Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license. ` +
  `O*NET® is a trademark of USDOL/ETA.`;
const MODIFIED_NOTICE =
  `Skillmark has modified all or some of this information. ` +
  `USDOL/ETA has not approved, endorsed, or tested these modifications.`;

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const hashes = {};
function load(name) {
  const buf = fs.readFileSync(path.join(dir, name));
  hashes[name] = crypto.createHash("sha256").update(buf).digest("hex");
  const [header, ...rows] = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  const expected = EXPECTED_HEADERS[name];
  if (JSON.stringify(header) !== JSON.stringify(expected)) {
    throw new Error(`${name}: unexpected columns.\n got: ${JSON.stringify(header)}\n want: ${JSON.stringify(expected)}`);
  }
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
function fail(msg) { throw new Error(msg); }

const occupations = load("occupation_data.csv");
const contentModel = load("content_model_reference.csv");
const scales = load("scales_reference.csv");
const skillRows = [...load("essential_skills.csv"), ...load("transferable_skills.csv")];
const softwareRows = load("software_skills.csv");

const occ = occupations.find((r) => r["O*NET-SOC Code"] === soc) ?? fail(`${soc} not in occupation_data.csv`);

// Skill elements = leaf elements under 2.A (basic) and 2.B (cross-functional), per content model.
const elements = contentModel.filter((r) => /^2\.[AB]\.\d+\.[a-z]$/.test(r["Element ID"]));
if (elements.length !== 35) fail(`expected 35 skill elements in content model, found ${elements.length}`);
const elementIds = new Set(elements.map((e) => e["Element ID"]));

const scaleDef = (id) => scales.find((s) => s["Scale ID"] === id) ?? fail(`scale ${id} missing`);
const IM = scaleDef("IM"), LV = scaleDef("LV");

const mine = skillRows.filter((r) => r["O*NET-SOC Code"] === soc);
const outside = mine.filter((r) => !elementIds.has(r["Element ID"]));
if (outside.length) fail(`unexpected non-2.A/2.B rows for ${soc}: ${outside.length}`);

const skills = elements.map((el) => {
  const id = el["Element ID"];
  const im = mine.find((r) => r["Element ID"] === id && r["Scale ID"] === "IM") ?? fail(`${soc} ${id}: no IM row`);
  const lv = mine.find((r) => r["Element ID"] === id && r["Scale ID"] === "LV") ?? fail(`${soc} ${id}: no LV row`);
  if (im["Element Name"] !== el["Element Name"] || lv["Element Name"] !== el["Element Name"])
    fail(`${id}: element name mismatch vs content model`);
  if (im["Date"] !== lv["Date"]) fail(`${id}: IM/LV date mismatch`);
  return {
    element_id: id,
    skill_name: el["Element Name"],
    importance: Number(im["Data Value"]),
    level: Number(lv["Data Value"]),
    importance_suppressed: im["Recommend Suppress"] === "Y",
    level_suppressed: lv["Recommend Suppress"] === "Y",
    not_relevant: im["Not Relevant"] === "Y" || lv["Not Relevant"] === "Y",
    data_date: im["Date"],
  };
});
if (skills.length !== 35) fail(`expected 35 skills for ${soc}, got ${skills.length}`);
for (const s of skills) {
  if (!Number.isFinite(s.importance) || !Number.isFinite(s.level)) fail(`${s.element_id}: non-numeric value`);
  if (s.importance < Number(IM.Minimum) || s.importance > Number(IM.Maximum)) fail(`${s.element_id}: IM out of range`);
  if (s.level < Number(LV.Minimum) || s.level > Number(LV.Maximum)) fail(`${s.element_id}: LV out of range`);
}

const techSkills = softwareRows
  .filter((r) => r["O*NET-SOC Code"] === soc)
  .map((r) => ({
    example_name: r["Workplace Example"],
    category_element_id: r["Element ID"],
    category_name: r["Element Name"],
    hot_technology: r["Hot Technology"] === "Y",
    in_demand: r["In Demand"] === "Y",
  }));
const flagBad = softwareRows.filter((r) => r["O*NET-SOC Code"] === soc &&
  (!["Y", "N"].includes(r["Hot Technology"]) || !["Y", "N"].includes(r["In Demand"])));
if (flagBad.length) fail("unexpected Hot Technology / In Demand values");
const keys = new Set(techSkills.map((t) => `${t.example_name}|${t.category_element_id}`));
if (keys.size !== techSkills.length) fail("duplicate tech skill (example, category) rows");
if (!techSkills.some((t) => t.example_name === "Structured query language SQL"))
  fail(`${soc} does not list "Structured query language SQL"`);

const out = {
  onet_version: version,
  source_base_url: SOURCE_BASE,
  source_files: Object.fromEntries(FILES.map((f) => [f, { url: `${SOURCE_BASE}/${f}`, sha256: hashes[f] }])),
  license: "CC BY 4.0",
  attribution: ATTRIBUTION,
  modified_notice: MODIFIED_NOTICE,
  scales: { IM: { name: IM["Scale Name"], min: Number(IM.Minimum), max: Number(IM.Maximum) },
            LV: { name: LV["Scale Name"], min: Number(LV.Minimum), max: Number(LV.Maximum) } },
  occupation: { soc_code: soc, title: occ.Title, description: occ.Description },
  skills,
  tech_skills: techSkills,
};

fs.mkdirSync("data/onet", { recursive: true });
fs.writeFileSync(`data/onet/${soc}.json`, JSON.stringify(out, null, 2) + "\n");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const b = (v) => (v ? "true" : "false");
const sql = `-- Generated by scripts/import-onet.mjs from data/onet/${soc}.json. Do not edit by hand.
-- Source: O*NET ${version} Database (CC BY 4.0), ${SOURCE_BASE}/
-- Apply via Supabase Dashboard > SQL Editor.

create table public.onet_sources (
  version text primary key,
  license text not null,
  attribution text not null,
  modified_notice text not null,
  source_url text not null,
  scales jsonb not null
);

create table public.onet_occupations (
  soc_code text not null,
  onet_version text not null references public.onet_sources(version),
  title text not null,
  description text not null,
  primary key (soc_code, onet_version)
);

-- Raw O*NET scale values: importance (IM) 1-5, level (LV) 0-7. Not normalized here.
create table public.onet_skill_requirements (
  soc_code text not null,
  onet_version text not null references public.onet_sources(version),
  element_id text not null,          -- O*NET content model ID, e.g. 2.A.1.e
  skill_name text not null,
  importance numeric(5,2) not null,
  level numeric(5,2) not null,
  importance_suppressed boolean not null,
  level_suppressed boolean not null,
  not_relevant boolean not null,
  data_date text not null,
  primary key (soc_code, onet_version, element_id)
);

-- Technology skills have no importance/level; excluded from gap math.
create table public.onet_tech_skills (
  soc_code text not null,
  onet_version text not null references public.onet_sources(version),
  example_name text not null,
  category_element_id text not null, -- e.g. 2.E.6.f
  category_name text not null,
  hot_technology boolean not null,
  in_demand boolean not null,
  primary key (soc_code, onet_version, example_name, category_element_id)
);

alter table public.onet_sources            enable row level security;
alter table public.onet_occupations        enable row level security;
alter table public.onet_skill_requirements enable row level security;
alter table public.onet_tech_skills        enable row level security;

-- Public reference data: read-only for signed-in users; writes only via service role / SQL Editor.
revoke all on public.onet_sources, public.onet_occupations,
              public.onet_skill_requirements, public.onet_tech_skills
  from anon, authenticated;
grant select on public.onet_sources, public.onet_occupations,
                public.onet_skill_requirements, public.onet_tech_skills
  to authenticated;

create policy onet_sources_read on public.onet_sources
  for select to authenticated using (true);
create policy onet_occupations_read on public.onet_occupations
  for select to authenticated using (true);
create policy onet_skill_requirements_read on public.onet_skill_requirements
  for select to authenticated using (true);
create policy onet_tech_skills_read on public.onet_tech_skills
  for select to authenticated using (true);

insert into public.onet_sources (version, license, attribution, modified_notice, source_url, scales) values
  (${q(version)}, ${q(out.license)}, ${q(ATTRIBUTION)}, ${q(MODIFIED_NOTICE)}, ${q(SOURCE_BASE + "/")}, ${q(JSON.stringify(out.scales))}::jsonb);

insert into public.onet_occupations (soc_code, onet_version, title, description) values
  (${q(soc)}, ${q(version)}, ${q(occ.Title)}, ${q(occ.Description)});

insert into public.onet_skill_requirements
  (soc_code, onet_version, element_id, skill_name, importance, level,
   importance_suppressed, level_suppressed, not_relevant, data_date) values
${skills.map((s) => `  (${q(soc)}, ${q(version)}, ${q(s.element_id)}, ${q(s.skill_name)}, ${s.importance}, ${s.level}, ${b(s.importance_suppressed)}, ${b(s.level_suppressed)}, ${b(s.not_relevant)}, ${q(s.data_date)})`).join(",\n")};

insert into public.onet_tech_skills
  (soc_code, onet_version, example_name, category_element_id, category_name, hot_technology, in_demand) values
${techSkills.map((t) => `  (${q(soc)}, ${q(version)}, ${q(t.example_name)}, ${q(t.category_element_id)}, ${q(t.category_name)}, ${b(t.hot_technology)}, ${b(t.in_demand)})`).join(",\n")};
`;
const sqlPath = `supabase/migrations/0004_onet_${soc.replace(/[.-]/g, "_")}.sql`;
fs.writeFileSync(sqlPath, sql);
console.log(JSON.stringify({ soc, title: occ.Title, version, skills: skills.length, tech_skills: techSkills.length, sqlPath }));
