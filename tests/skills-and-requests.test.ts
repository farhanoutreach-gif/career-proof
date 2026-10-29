import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, noSession);
const anon = createClient(url, publishable, noSession);

const SQL_ID = "2.E.6.f:Structured query language SQL";
const anchorData = JSON.parse(readFileSync("data/onet/level_anchors_31.0.json", "utf8"));
const onet = JSON.parse(readFileSync("data/onet/15-2051.01.json", "utf8"));

type U = { id: string; client: SupabaseClient };
async function makeUser(label: string): Promise<U> {
  const email = `sr-${label}-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, publishable, noSession);
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, client };
}

let a: U, b: U, profileId: string;
beforeAll(async () => {
  a = await makeUser("a");
  b = await makeUser("b");
  const p = await a.client
    .from("career_profiles")
    .insert({ target_career_id: "15-2051.01", source: "manual" })
    .select("id")
    .single();
  if (p.error) throw p.error;
  profileId = p.data.id;
});
afterAll(async () => {
  for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
});

describe("claiming skills via the client API", () => {
  it("insert then update of claims leaves evidence_type self_reported", async () => {
    const res = await a.client.from("user_skills").insert([
      { profile_id: profileId, skill_id: "2.A.1.a", claimed_level: 70 },
      { profile_id: profileId, skill_id: SQL_ID, claimed_level: null },
    ]);
    expect(res.error).toBeNull();
    const again = await a.client
      .from("user_skills")
      .update({ claimed_level: 55 })
      .eq("profile_id", profileId)
      .eq("skill_id", "2.A.1.a");
    expect(again.error).toBeNull();

    const rows = await a.client.from("user_skills").select("skill_id, claimed_level, evidence_type, verified_at");
    expect(rows.data).toHaveLength(2);
    expect(rows.data!.every((r) => r.evidence_type === "self_reported" && r.verified_at === null)).toBe(true);
    expect(rows.data!.find((r) => r.skill_id === "2.A.1.a")!.claimed_level).toBe(55);
    expect(rows.data!.find((r) => r.skill_id === SQL_ID)!.claimed_level).toBeNull();
  });

  it("cannot self-verify via insert or update of evidence_type", async () => {
    const ins = await a.client
      .from("user_skills")
      .insert([{ profile_id: profileId, skill_id: "2.A.1.b", claimed_level: 90, evidence_type: "verified" }]);
    expect(ins.error).not.toBeNull();
    const upd = await a.client.from("user_skills").update({ evidence_type: "verified" }).eq("skill_id", "2.A.1.a");
    expect(upd.error).not.toBeNull();
  });
});

describe("O*NET level anchors", () => {
  it("every skill has anchors in the DB identical to the CSV-derived JSON", async () => {
    const res = await a.client.from("onet_level_anchors").select("element_id, anchor_value, anchor_description").eq("onet_version", "31.0");
    expect(res.error).toBeNull();
    const key = (r: { element_id: string; anchor_value: number; anchor_description: string }) =>
      `${r.element_id}|${r.anchor_value}|${r.anchor_description}`;
    expect(res.data!.map(key).sort()).toEqual(anchorData.anchors.map(key).sort());
    const have = new Set(res.data!.map((r) => r.element_id));
    for (const s of onet.skills) expect(have.has(s.element_id)).toBe(true);
  });
});

describe("career_requests RLS", () => {
  it("lets a user insert and read their own request, with user_id set by the database", async () => {
    const ins = await a.client.from("career_requests").insert({ career_text: "Data Scientist" }).select("user_id").single();
    expect(ins.error).toBeNull();
    expect(ins.data!.user_id).toBe(a.id);
    const mine = await a.client.from("career_requests").select("career_text");
    expect(mine.data!.map((r) => r.career_text)).toEqual(["Data Scientist"]);
  });

  it("hides another user's requests", async () => {
    const theirs = await b.client.from("career_requests").select("*");
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
  });

  it("denies anon access", async () => {
    const read = await anon.from("career_requests").select("*");
    expect(read.data ?? []).toEqual([]);
    const ins = await anon.from("career_requests").insert({ career_text: "x" });
    expect(ins.error).not.toBeNull();
  });

  it("cannot insert on behalf of another user, or update/delete", async () => {
    const spoof = await b.client.from("career_requests").insert({ career_text: "x", user_id: a.id });
    expect(spoof.error).not.toBeNull();
    const upd = await a.client.from("career_requests").update({ career_text: "y" }).eq("user_id", a.id);
    expect(upd.error).not.toBeNull();
    const del = await a.client.from("career_requests").delete().eq("user_id", a.id);
    expect(del.error).not.toBeNull();
  });

  it("rejects empty and over-long text", async () => {
    expect((await b.client.from("career_requests").insert({ career_text: "   " })).error).not.toBeNull();
    expect((await b.client.from("career_requests").insert({ career_text: "x".repeat(201) })).error).not.toBeNull();
  });
});
