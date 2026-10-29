import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, noSession);

const SOC = "15-2051.01";
const data = JSON.parse(readFileSync(`data/onet/${SOC}.json`, "utf8"));

let userId: string;
let user: SupabaseClient;
const anon = createClient(url, publishable, noSession);

beforeAll(async () => {
  const email = `onet-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  user = createClient(url, publishable, noSession);
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("O*NET reference data", () => {
  it("records version, license and attribution", async () => {
    const res = await user.from("onet_sources").select("*").eq("version", data.onet_version).single();
    expect(res.error).toBeNull();
    expect(res.data!.license).toBe("CC BY 4.0");
    expect(res.data!.attribution).toContain(`O*NET ${data.onet_version} Database`);
    expect(res.data!.attribution).toContain("CC BY 4.0");
  });

  it("takes the occupation title from O*NET", async () => {
    const res = await user.from("onet_occupations").select("title").eq("soc_code", SOC).single();
    expect(res.data!.title).toBe(data.occupation.title);
  });

  it("has 35 skills, each with importance and level, all stamped with the version", async () => {
    const res = await user.from("onet_skill_requirements").select("*").eq("soc_code", SOC);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(35);
    for (const r of res.data!) {
      expect(r.onet_version).toBe(data.onet_version);
      expect(r.importance).not.toBeNull();
      expect(r.level).not.toBeNull();
      expect(r.element_id).toMatch(/^2\.[AB]\./);
    }
  });

  it("matches the committed JSON value-for-value", async () => {
    const res = await user.from("onet_skill_requirements").select("*").eq("soc_code", SOC);
    const byId = new Map(res.data!.map((r) => [r.element_id, r]));
    for (const s of data.skills) {
      const row = byId.get(s.element_id)!;
      expect(row.skill_name).toBe(s.skill_name);
      expect(Number(row.importance)).toBe(s.importance);
      expect(Number(row.level)).toBe(s.level);
      expect(row.not_relevant).toBe(s.not_relevant);
    }
  });

  it("stores technology skills with flags, including SQL", async () => {
    const res = await user.from("onet_tech_skills").select("*").eq("soc_code", SOC);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(data.tech_skills.length);
    const sql = res.data!.find((r) => r.example_name === "Structured query language SQL");
    expect(sql).toMatchObject({ category_element_id: "2.E.6.f", hot_technology: true, in_demand: true });
  });

  it("is not readable without signing in", async () => {
    for (const table of ["onet_sources", "onet_occupations", "onet_skill_requirements", "onet_tech_skills"]) {
      const res = await anon.from(table).select("*").limit(1);
      expect(res.data ?? []).toEqual([]);
    }
  });

  it("cannot be written by signed-in users", async () => {
    const ins = await user.from("onet_skill_requirements").insert({
      soc_code: SOC, onet_version: data.onet_version, element_id: "9.9.9.z", skill_name: "x",
      importance: 5, level: 7, importance_suppressed: false, level_suppressed: false,
      not_relevant: false, data_date: "01/2026",
    });
    const upd = await user.from("onet_skill_requirements").update({ importance: 5 }).eq("soc_code", SOC).select();
    const del = await user.from("onet_tech_skills").delete().eq("soc_code", SOC).select();
    const insTech = await user.from("onet_tech_skills").insert({
      soc_code: SOC, onet_version: data.onet_version, example_name: "x",
      category_element_id: "2.E.6.f", category_name: "x", hot_technology: true, in_demand: true,
    });
    expect(ins.error).not.toBeNull();
    expect(upd.error).not.toBeNull();
    expect(del.error).not.toBeNull();
    expect(insTech.error).not.toBeNull();

    const count = await admin
      .from("onet_skill_requirements")
      .select("*", { count: "exact", head: true })
      .eq("soc_code", SOC);
    expect(count.count).toBe(35);
  });
});

describe("target career on career_profiles", () => {
  it("is recorded on insert, then updated in place (one row per user)", async () => {
    const ins = await user
      .from("career_profiles")
      .insert({ target_career_id: SOC, source: "manual" })
      .select("id, target_career_id")
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data!.target_career_id).toBe(SOC);

    const upd = await user.from("career_profiles").update({ target_career_id: SOC }).eq("id", ins.data!.id);
    expect(upd.error).toBeNull();

    const all = await user.from("career_profiles").select("id, target_career_id");
    expect(all.data).toEqual([{ id: ins.data!.id, target_career_id: SOC }]);

    const dup = await user.from("career_profiles").insert({ target_career_id: SOC });
    expect(dup.error).not.toBeNull();
  });

  it("rejects any other SOC", async () => {
    const res = await user.from("career_profiles").update({ target_career_id: "13-2051.00" }).eq("user_id", userId);
    expect(res.error?.message).toMatch(/career_profiles_target_career_v1/);
  });
});
