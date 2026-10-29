import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, noSession);
const SQL_ID = "2.E.6.f:Structured query language SQL";

let userId: string;
let email: string;
const password = randomUUID();

test.beforeAll(async () => {
  email = `e2e-${randomUUID()}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const c = createClient(url, publishable, noSession);
  await c.auth.signInWithPassword({ email, password });
  const p = await c.from("career_profiles").insert({ target_career_id: "15-2051.01", source: "manual" });
  if (p.error) throw p.error;
});
test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

async function savedSkillIds() {
  const res = await admin
    .from("user_skills")
    .select("skill_id, claimed_level, evidence_type, career_profiles!inner(user_id)")
    .eq("career_profiles.user_id", userId);
  if (res.error) throw res.error;
  return res.data;
}

test("ticking SQL in the real form saves it and /profile lists it under Tools as Unverified", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/skills");
  await page.reload(); // same as the user's F5
  const sql = page.getByRole("checkbox", { name: /Structured query language SQL/ });
  await sql.check();
  await expect(sql).toBeChecked();
  await page.getByRole("button", { name: "Save my skills" }).click();
  await page.waitForURL("**/profile");

  const rows = await savedSkillIds();
  expect(rows.map((r) => r.skill_id)).toContain(SQL_ID);
  expect(rows.find((r) => r.skill_id === SQL_ID)).toMatchObject({ claimed_level: null, evidence_type: "self_reported" });

  await expect(page.getByRole("heading", { name: "Tools (1)" })).toBeVisible();
  const tools = page.locator("section", { has: page.getByRole("heading", { name: /^Tools/ }) });
  await expect(tools).toContainText("Structured query language SQL");
  await expect(tools).toContainText("Unverified");
});
