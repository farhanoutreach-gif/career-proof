import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, noSession);

async function makeUser(label: string) {
  const email = `rls-${label}-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient(url, publishable, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

type User = { id: string; client: SupabaseClient };
let a: User, b: User;
let aProfileId: string, bProfileId: string;
let aSkillId: string, bSkillId: string;
let challengeId: string;

beforeAll(async () => {
  a = await makeUser("a");
  b = await makeUser("b");

  const pa = await a.client
    .from("career_profiles")
    .insert({ current_stage: "student", target_career_id: "15-2051.01", source: "manual" })
    .select("id")
    .single();
  expect(pa.error).toBeNull();
  aProfileId = pa.data!.id;

  const pb = await b.client
    .from("career_profiles")
    .insert({ current_stage: "switcher" })
    .select("id")
    .single();
  expect(pb.error).toBeNull();
  bProfileId = pb.data!.id;

  const sa = await a.client
    .from("user_skills")
    .insert({ profile_id: aProfileId, skill_id: "sql", claimed_level: 80 })
    .select("id, evidence_type")
    .single();
  expect(sa.error).toBeNull();
  expect(sa.data!.evidence_type).toBe("self_reported");
  aSkillId = sa.data!.id;

  const sb = await b.client
    .from("user_skills")
    .insert({ profile_id: bProfileId, skill_id: "sql", claimed_level: 50 })
    .select("id")
    .single();
  expect(sb.error).toBeNull();
  bSkillId = sb.data!.id;

  const ch = await admin
    .from("challenges")
    .insert({ skill_id: "sql", type: "deterministic", grading_spec: { expected: [[1]] } })
    .select("id")
    .single();
  expect(ch.error).toBeNull();
  challengeId = ch.data!.id;

  const sub = await admin
    .from("submissions")
    .insert({ challenge_id: challengeId, profile_id: aProfileId, result_score: 100 });
  expect(sub.error).toBeNull();
});

afterAll(async () => {
  // Order matters: submissions reference challenges, so remove them first.
  // Deleting the auth users cascades to profiles and skills.
  if (challengeId) await admin.from("submissions").delete().eq("challenge_id", challengeId);
  if (a) await admin.auth.admin.deleteUser(a.id);
  if (b) await admin.auth.admin.deleteUser(b.id);
  if (challengeId) {
    const del = await admin.from("challenges").delete().eq("id", challengeId);
    if (del.error) throw new Error(`fixture cleanup failed: ${del.error.message}`);
  }
});

describe("cross-user isolation (User B vs User A)", () => {
  it("B cannot read A's career_profiles, user_skills, or submissions", async () => {
    const profiles = await b.client.from("career_profiles").select("*").eq("id", aProfileId);
    const skills = await b.client.from("user_skills").select("*").eq("profile_id", aProfileId);
    const subs = await b.client.from("submissions").select("*").eq("profile_id", aProfileId);
    expect(profiles.error).toBeNull();
    expect(skills.error).toBeNull();
    expect(subs.error).toBeNull();
    expect(profiles.data).toEqual([]);
    expect(skills.data).toEqual([]);
    expect(subs.data).toEqual([]);
  });

  it("B sees only their own rows when selecting everything", async () => {
    const profiles = await b.client.from("career_profiles").select("id");
    const skills = await b.client.from("user_skills").select("id");
    expect(profiles.data!.map((r) => r.id)).toEqual([bProfileId]);
    expect(skills.data!.map((r) => r.id)).toEqual([bSkillId]);
  });

  it("A can read their own rows (so the empty results above are RLS, not a broken query)", async () => {
    const profiles = await a.client.from("career_profiles").select("id").eq("id", aProfileId);
    const subs = await a.client.from("submissions").select("id").eq("profile_id", aProfileId);
    expect(profiles.data).toHaveLength(1);
    expect(subs.data).toHaveLength(1);
  });

  it("B cannot update or delete A's rows (0 rows affected, A's data unchanged)", async () => {
    const upd = await b.client
      .from("user_skills")
      .update({ claimed_level: 1 })
      .eq("id", aSkillId)
      .select();
    const del = await b.client.from("user_skills").delete().eq("id", aSkillId).select();
    const updProfile = await b.client
      .from("career_profiles")
      .update({ target_career_id: "hacked" })
      .eq("id", aProfileId)
      .select();
    expect(upd.data).toEqual([]);
    expect(del.data).toEqual([]);
    expect(updProfile.data).toEqual([]);

    const skill = await admin
      .from("user_skills")
      .select("claimed_level")
      .eq("id", aSkillId)
      .single();
    const profile = await admin
      .from("career_profiles")
      .select("target_career_id")
      .eq("id", aProfileId)
      .single();
    expect(skill.data!.claimed_level).toBe(80);
    expect(profile.data!.target_career_id).toBe("15-2051.01");
  });

  it("B cannot insert a skill onto A's profile", async () => {
    const res = await b.client
      .from("user_skills")
      .insert({ profile_id: aProfileId, skill_id: "excel", claimed_level: 10 });
    expect(res.error).not.toBeNull();
  });

  it("B cannot re-point their own skill to A's profile", async () => {
    const res = await b.client
      .from("user_skills")
      .update({ profile_id: aProfileId })
      .eq("id", bSkillId)
      .select();
    // profile_id is not an updatable column for clients at all.
    expect(res.error).not.toBeNull();
  });

  it("B cannot create a profile for A's user_id", async () => {
    const res = await b.client.from("career_profiles").insert({ user_id: a.id });
    expect(res.error).not.toBeNull();
  });
});

describe("clients cannot set evidence fields (Principle #3)", () => {
  const forbidden: Record<string, unknown>[] = [
    { evidence_type: "verified" },
    { evidence_type: "ai_assessed" },
    { evidence_score: 100 },
    { evidence_source: "fake-challenge" },
    { verified_at: new Date().toISOString() },
  ];

  it.each(forbidden)("B cannot UPDATE own skill with %o", async (patch) => {
    const res = await b.client.from("user_skills").update(patch).eq("id", bSkillId).select();
    expect(res.error).not.toBeNull();
    expect(res.error!.message).toMatch(/permission denied/i);
  });

  it("B cannot INSERT a skill pre-set to verified", async () => {
    const res = await b.client.from("user_skills").insert({
      profile_id: bProfileId,
      skill_id: "excel",
      evidence_type: "verified",
      evidence_score: 100,
    });
    expect(res.error).not.toBeNull();
    expect(res.error!.message).toMatch(/permission denied/i);
  });

  it("B's skill row is still self_reported with no evidence (checked via service role)", async () => {
    const { data } = await admin.from("user_skills").select("*").eq("id", bSkillId).single();
    expect(data!.evidence_type).toBe("self_reported");
    expect(data!.evidence_score).toBeNull();
    expect(data!.evidence_source).toBeNull();
    expect(data!.verified_at).toBeNull();
  });

  it("B can still edit permitted fields", async () => {
    const res = await b.client
      .from("user_skills")
      .update({ claimed_level: 60, user_confirmed_include: true })
      .eq("id", bSkillId)
      .select();
    expect(res.error).toBeNull();
    expect(res.data![0].claimed_level).toBe(60);
  });

  it("B cannot write submissions, even for their own profile", async () => {
    const ins = await b.client
      .from("submissions")
      .insert({ challenge_id: challengeId, profile_id: bProfileId, result_score: 100 });
    expect(ins.error).not.toBeNull();
    const upd = await b.client
      .from("submissions")
      .update({ result_score: 100 })
      .eq("profile_id", aProfileId);
    expect(upd.error).not.toBeNull();
  });

  it("B cannot delete a skill once it is no longer self_reported", async () => {
    const proven = await admin
      .from("user_skills")
      .insert({
        profile_id: bProfileId,
        skill_id: "proven",
        evidence_type: "verified",
        evidence_score: 90,
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(proven.error).toBeNull();
    const del = await b.client.from("user_skills").delete().eq("id", proven.data!.id).select();
    expect(del.data).toEqual([]);
    const still = await admin.from("user_skills").select("id").eq("id", proven.data!.id);
    expect(still.data).toHaveLength(1);
  });
});

describe("challenges: grading_spec is hidden from clients", () => {
  it("B cannot select grading_spec", async () => {
    const res = await b.client.from("challenges").select("grading_spec");
    expect(res.error).not.toBeNull();
    expect(res.error!.message).toMatch(/permission denied/i);
  });

  it("B cannot select *", async () => {
    const res = await b.client.from("challenges").select("*");
    expect(res.error).not.toBeNull();
  });

  it("B can select id, skill_id, type", async () => {
    const res = await b.client
      .from("challenges")
      .select("id, skill_id, type")
      .eq("id", challengeId);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });

  it("B cannot write challenges", async () => {
    const res = await b.client
      .from("challenges")
      .insert({ skill_id: "x", type: "deterministic", grading_spec: {} });
    expect(res.error).not.toBeNull();
  });
});

describe("schema CHECK constraints (via service role, bypassing RLS)", () => {
  it("rejects bad evidence_type", async () => {
    const res = await admin
      .from("user_skills")
      .insert({ profile_id: aProfileId, skill_id: "c1", evidence_type: "bogus" });
    expect(res.error?.message).toMatch(/check constraint/i);
  });

  it("rejects out-of-range claimed_level and evidence_score", async () => {
    const lvl = await admin
      .from("user_skills")
      .insert({ profile_id: aProfileId, skill_id: "c2", claimed_level: 101 });
    const score = await admin
      .from("user_skills")
      .insert({ profile_id: aProfileId, skill_id: "c3", evidence_score: -1 });
    expect(lvl.error?.message).toMatch(/check constraint/i);
    expect(score.error?.message).toMatch(/check constraint/i);
  });

  it("rejects any target_career_id other than Business Intelligence Analysts (v1)", async () => {
    const viaClient = await b.client
      .from("career_profiles")
      .update({ target_career_id: "13-2051.00" })
      .eq("id", bProfileId)
      .select();
    const viaAdmin = await admin
      .from("career_profiles")
      .update({ target_career_id: "13-2051.00" })
      .eq("id", bProfileId);
    expect(viaClient.error?.message).toMatch(/career_profiles_target_career_v1/);
    expect(viaAdmin.error?.message).toMatch(/career_profiles_target_career_v1/);
    const ok = await b.client
      .from("career_profiles")
      .update({ target_career_id: "15-2051.01" })
      .eq("id", bProfileId)
      .select();
    expect(ok.error).toBeNull();
  });

  it("rejects bad challenge type", async () => {
    const res = await admin
      .from("challenges")
      .insert({ skill_id: "x", type: "freeform", grading_spec: {} });
    expect(res.error?.message).toMatch(/check constraint/i);
  });
});

describe("anonymous (no session)", () => {
  it("cannot read any table", async () => {
    const anon = createClient(url, publishable, noSession);
    for (const table of ["career_profiles", "user_skills", "challenges", "submissions"]) {
      const res = await anon.from(table).select("id");
      const blocked = res.error !== null || (res.data ?? []).length === 0;
      expect(blocked, `${table} readable by anon`).toBe(true);
    }
  });
});
