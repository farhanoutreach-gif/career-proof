# CAREER PROOF — Master Build Prompt

**How to use this:** Save this file as `CLAUDE.md` in your project's repo root before starting Claude Code, so it's loaded as persistent project context every session. Then work through Section 8 (Build Sequence) **one task at a time** — paste a single numbered task as your actual prompt, let Claude Code finish and show you a diff, then move to the next one. Do not paste this whole document as a single "build the app" instruction — that's the one mistake this document is designed to prevent.

---

## 0. CURRENT SPRINT — 2-Day v1 (read this first; it overrides Section 8 ordering)

**Goal:** a live MVP at a public URL that real users can sign up for and complete the proof loop. ~10–12 hours total. U.S./global-English audience. No payments.

**Build ONLY these Section 8 tasks, in this order:** 2 → 3 → 6 → 7 → 8 → 9 → 10 → 12 → 13 → a combined lite pass of 15 + 16.
Task 1 is already done (live at https://career-proof-two.vercel.app).

**Deferred until after this sprint — do not build, scaffold, or stub:** Tasks 4, 5, 11, 14 (resume builder both paths, rubric challenge, resume generator update).

**Sprint adjustments:**
- **Skill entry:** skills come from a simple onboarding form (skill + self-rated level 0–100), not the resume builder. Every row still starts as `self_reported`.
- **Target career:** fixed to Financial Analyst (O*NET SOC 13-2051.00) for v1. Task 7 = record it on `career_profiles` during onboarding; no multi-career picker.
- **O*NET data:** use the free O*NET database download (not Web Services, which needs a registered key). Import Financial Analyst skill/importance/level values once into a seeded table or a versioned JSON file in the repo. Record the O*NET database version, show "Source: O*NET <version>" wherever requirements appear, and include O*NET's required CC BY 4.0 attribution. Never hand-type, estimate, or generate these values.
- **No LLM API in this sprint.** If a task seems to need one, stop and flag it.
- **SQL challenge:** runs server-side in an embedded engine (SQLite or PGlite) with fixed seed data. Grading compares result sets deterministically (order-insensitive unless the task requires ORDER BY). User SQL never touches the Supabase database.
- **Score in v1:** verified evidence only (`ai_assessed` does not exist yet), weighted by O*NET importance across the target career's skills.
- **Proof of done:** show evidence for every "done" condition (test output, a reproducible query, or a screenshot), not a claim.

**Schema fixes to include in the Task 3 migration (gaps in Section 4):**
- Add `user_confirmed_include boolean not null default false` to `user_skills`. The resume rule in Section 4 references it, but the table doesn't define it.
- Add CHECK constraints: `evidence_type in ('self_reported','ai_assessed','verified')`; `claimed_level` and `evidence_score` between 0 and 100; `challenges.type in ('deterministic','rubric')`.
- **Clients must not be able to set evidence fields.** Owner-scoped RLS alone would let a logged-in user call the Supabase API directly and set their own row to `verified`, which breaks Principle #3. Revoke client UPDATE on `evidence_type`, `evidence_score`, `evidence_source`, `verified_at`, and client INSERT/UPDATE on `submissions`; only server-side grading code (service role) writes them. Add a test proving a user cannot self-verify via the API.

---

## 1. Product Thesis

Career Proof is a career operating system built around one persistent object — the **Career Profile** — that every feature reads from and writes to. A free resume builder is the acquisition engine: people arrive needing a resume and leave with a structured profile the app can build on. The paid layers help them close skill gaps and **prove** their abilities with evidence, not just claims.

The differentiator is not the skill-matching itself (competitors like SkillShift.ai already do this). The differentiator is the proof loop: **claimed skill → challenge → verified or assessed evidence → Career Passport → resume that only surfaces what's actually backed by evidence.**

---

## 2. Non-Negotiable Principles

These override convenience, speed, or a cleaner-looking demo. Do not deviate from these even if a shortcut seems harmless.

1. **Never invent occupation, skill, salary, or demand data.** All of it comes from O*NET (or another named structured source). The AI's job is to explain and personalize — never to be the source of fact.
2. **Nothing parsed from an uploaded document is saved without the user confirming it.** Extraction is always a draft, shown on an editable confirm screen, never written to the database silently.
3. **`evidence_type` is set by the system, never by a prompt.** A skill becomes `verified` only after passing a deterministic check. A skill becomes `ai_assessed` only after rubric-based grading. Nothing becomes either of these because an LLM said so in free text.
4. **Deterministic checks wherever a skill is objectively checkable.** Rubric-based AI grading only where judgment is genuinely required (e.g., written business reasoning). Never let an LLM "eyeball" verifiable work like SQL or formulas and call it Verified.
5. **Resume and application generation defaults to verified + user-confirmed claimed skills only.** A claimed-but-unproven skill never silently appears as fact in generated output.
6. **One scoped, testable task at a time.** If a task doesn't have a clear "done" condition, don't start it — ask for clarification first.

---

## 3. Tech Stack

- **Frontend:** Next.js + TypeScript, Tailwind CSS
- **Backend/DB:** Supabase (Postgres, Auth, Storage, Row-Level Security)
- **Structured data layer:** O*NET Web Services (REST/JSON) — occupation and skill requirements
- **AI — extraction:** LLM API, output validated with Zod before anything touches the database
- **AI — rubric grading:** LLM API against a fixed, versioned rubric (never a free-form prompt)
- **Deterministic grading:** sandboxed Postgres/SQLite instance, seeded with fixed data, for verifiable challenges
- **Deploy:** Vercel

---

## 4. Data Model

Run these as your initial Supabase migration. Row-Level Security must be enabled on every table before any feature code is written against it — a user must never be able to query another user's rows.

```sql
-- career_profiles: one per user, the object everything else reads/writes
create table career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  current_stage text,              -- student / early-career / switcher
  target_career_id text,           -- O*NET SOC code
  source text,                     -- resume-built / resume-uploaded / manual
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- user_skills: enforces claimed-vs-verified at the schema level
create table user_skills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references career_profiles not null,
  skill_id text not null,                      -- O*NET skill/tech reference
  claimed_level int,                            -- 0-100, self-reported
  evidence_type text not null default 'self_reported', -- self_reported | ai_assessed | verified
  evidence_score int,                           -- 0-100, null until an attempt exists
  evidence_source text,                         -- challenge_id, or 'user_claim'
  verified_at timestamptz                       -- null until evidence_type = 'verified'
);

-- challenges: the proof tasks
create table challenges (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null,
  type text not null,                 -- 'deterministic' | 'rubric'
  grading_spec jsonb not null          -- expected output (deterministic) or rubric criteria (rubric)
);

-- submissions: one per user attempt
create table submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges not null,
  profile_id uuid references career_profiles not null,
  result_score int,                   -- 0-100
  result_detail jsonb,                -- per-criterion breakdown shown to the user
  created_at timestamptz default now()
);

-- Enable RLS on all four tables, with policies scoping every row
-- to auth.uid() = the owning user_id (via career_profiles.user_id).
```

**Downstream enforcement rules to implement in application code, not just the schema:**
- Resume generator query: `evidence_type IN ('verified') OR (evidence_type = 'self_reported' AND user_confirmed_include = true)`
- Career Proof score calculation: only rows where `evidence_type IN ('verified', 'ai_assessed')` count toward the score
- `self_reported` skills are visibly labeled as unverified everywhere they appear in the UI — never shown identically to verified ones

---

## 5. MVP Scope — Build Exactly These 9 Features, In This Order

| # | Feature | Depends on |
|---|---|---|
| 1 | Free resume builder (build-here default, upload secondary) | — |
| 2 | Career Profile | #1 |
| 3 | One target career selection | #2 |
| 4 | Skill-gap analysis (O*NET-sourced) | #3 |
| 5 | Claimed vs. evidence-backed skills (schema already defined above) | #4 |
| 6 | One deterministic challenge (SQL) | #5 |
| 7 | One rubric-based challenge | #5 |
| 8 | Career Proof score | #6, #7 |
| 9 | Career Passport | #8 |

---

## 6. Explicitly Out of Scope for This Build

Do not build, suggest building, or scaffold placeholder code for any of the following until this MVP is validated with real users:

- Job-board integration or live job data (Adzuna, Remotive, etc.)
- Voice-based mock interviews (speech-to-text/text-to-speech)
- Application tailoring / cover letter generation
- Portfolio hosting (public shareable pages)
- Payments / subscription billing
- The viral funnel (Career Reality Check, Career Identity Map) — **pending decision, see Section 10**
- Multiple target careers per user
- University/B2B dashboards

If a task seems to require one of these, stop and flag it rather than building a workaround.

---

## 7. The First End-to-End User Flow (what "done" looks like)

This is the single path that must work, start to finish, before any feature is considered complete in isolation:

1. User builds or uploads a resume
2. If uploaded: sees a confirm/edit screen before anything saves (Principle #2)
3. Chooses a target career (default for all testing/demo data: **Financial Analyst**, O*NET SOC 13-2051.00)
4. Sees skill gaps, sourced from O*NET, each labeled with its source
5. Claims a skill (e.g., SQL) — creates a `user_skills` row with `evidence_type = 'self_reported'`
6. Completes the SQL challenge
7. Submission is graded deterministically against seeded data
8. On pass, `evidence_type` flips to `'verified'`, `verified_at` is set
9. Career Proof score recalculates (only verified/ai_assessed evidence counts)
10. Career Passport reflects the new evidence, labeled by type

---

## 8. Build Sequence

Work through these one at a time. Each has a definition of done — don't move to the next until the current one's "done" condition is actually met and shown to you, not just claimed.

1. **Initialize Next.js + TypeScript, deploy empty shell to Vercel.**
   *Done when:* a blank page is live at a real URL.

2. **Set up Supabase: Auth, Postgres, RLS enabled project-wide.**
   *Done when:* a test user can sign up, log in, and a second test user cannot see the first user's (empty) data via direct API query.

3. **Run the migration in Section 4.**
   *Done when:* all four tables exist with RLS policies, verified by attempting a cross-user read and confirming it's denied.

4. **Resume builder — build-here path.** Manual form: education, experience, skills, projects. PDF export, one ATS-friendly template.
   *Done when:* a user can produce a downloadable PDF resume with zero AI involvement.

5. **Resume builder — upload path.** PDF/DOCX text extraction → LLM structured extraction → confirm/edit screen → only then save to `career_profiles`.
   *Done when:* uploading a deliberately messy resume never silently saves a wrong field — the user always sees and can correct it first.

6. **O*NET integration for one target career.** Fetch task/skill requirements for Financial Analyst (SOC 13-2051.00) via O*NET Web Services.
   *Done when:* skill requirements for that one career are stored/cached and queryable.

7. **Target career selection screen.**
   *Done when:* a user can select Financial Analyst and it's recorded on their `career_profiles` row.

8. **Skill-gap calculation.** Required level minus claimed level, per skill, weighted by O*NET importance.
   *Done when:* the gap list for a test profile matches a hand-calculated expected result.

9. **`user_skills` wiring.** Every skill a user claims creates a row with `evidence_type = 'self_reported'` by default.
   *Done when:* claiming a skill is visible in the Career Profile UI, correctly labeled as unverified.

10. **Deterministic SQL challenge.** One seeded dataset, one expected-output checker, sandboxed execution.
    *Done when:* a correct submission flips `evidence_type` to `verified`; an incorrect one does not, and shows what was wrong.

11. **Rubric-based challenge.** One judgment-based task (e.g., short financial-analysis write-up), graded by LLM against a fixed rubric.
    *Done when:* a submission returns a per-criterion score and is labeled `ai_assessed` — visually distinct from `verified` — never the reverse.

12. **Career Proof score.** Calculated only from `verified` + `ai_assessed` evidence, per the rule in Section 4.
    *Done when:* adding a self-reported-only skill does not change the score, but completing a challenge does.

13. **Career Passport page.** Every skill shown with its evidence type, source, and date.
    *Done when:* a self-reported skill and a verified skill are visually distinguishable at a glance, not just by a small label.

14. **Resume generator update.** Apply the downstream enforcement rule from Section 4.
    *Done when:* an unproven claimed skill does not appear in the generated resume unless the user explicitly opts it in via a visible flag.

15. **Security review pass.** Open a fresh session; ask Claude Code to review as a hostile reviewer — check RLS policies, cross-user access, exposed secrets, unvalidated input. Rank findings Critical/High/Medium/Low, fix Critical and High only, add regression tests for each fix.

16. **Edge-case pass.** Malformed resumes, failed challenge submissions, O*NET API failures, low-confidence extraction — each should fail gracefully and visibly, never silently.

---

## 9. Working Method

- One task from Section 8 per session or per clearly-scoped prompt. Never "build the whole MVP."
- After tasks 5, 10, 11, and 14 specifically (anywhere AI output touches saved data or user-facing claims), do a dedicated review pass before moving on — these are the highest-risk points for the Non-Negotiable Principles in Section 2 to quietly get violated.
- If Claude Code proposes a shortcut that would violate any principle in Section 2 (e.g., "just have the LLM grade the SQL for simplicity"), reject it explicitly and ask for the deterministic version, even if slower to build.

---

## 10. Pending Decisions — Flagged, Not Blocking

These are real open questions from product planning. They do **not** block building the Section 8 sequence, but should be resolved before extending past it:

- **Geography-first: DECIDED (Oct 29, 2026): U.S./global-English first.** UI copy referencing skill requirements should say "based on U.S. O*NET occupational data."
- **Viral funnel branch:** Career Reality Check vs. Career Identity Map — geography is now decided (U.S.), but the funnel choice is still open. Not part of this build sequence at all.
- **Pricing/billing:** Not needed for this MVP — no payment infrastructure should be built yet.

Do not let an AI coding session "decide" any of these by default — if a task seems to require picking one, stop and ask.