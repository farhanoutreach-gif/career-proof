# CAREER PROOF — Master Build Prompt

Persistent project context. Work through Section 8 (Build Sequence) **one task at a time**. Never "build the whole MVP" in one prompt.

---

## 1. Product Thesis

Career Proof is a career operating system built around one persistent object — the **Career Profile** — that every feature reads from and writes to. A free resume builder is the acquisition engine: people arrive needing a resume and leave with a structured profile the app can build on. The paid layers help them close skill gaps and **prove** their abilities with evidence, not just claims.

The differentiator is not the skill-matching itself (competitors like SkillShift.ai already do this). The differentiator is the proof loop: **claimed skill → challenge → verified or assessed evidence → Career Passport → resume that only surfaces what's actually backed by evidence.**

---

## 2. Non-Negotiable Principles

These override convenience, speed, or a cleaner-looking demo.

1. **Never invent occupation, skill, salary, or demand data.** All of it comes from O*NET (or another named structured source). The AI's job is to explain and personalize — never to be the source of fact.
2. **Nothing parsed from an uploaded document is saved without the user confirming it.** Extraction is always a draft, shown on an editable confirm screen, never written to the database silently.
3. **`evidence_type` is set by the system, never by a prompt.** A skill becomes `verified` only after passing a deterministic check. A skill becomes `ai_assessed` only after rubric-based grading. Nothing becomes either because an LLM said so in free text.
4. **Deterministic checks wherever a skill is objectively checkable.** Rubric-based AI grading only where judgment is genuinely required. Never let an LLM "eyeball" verifiable work like SQL or formulas and call it Verified.
5. **Resume and application generation defaults to verified + user-confirmed claimed skills only.** A claimed-but-unproven skill never silently appears as fact in generated output.
6. **One scoped, testable task at a time.** If a task doesn't have a clear "done" condition, don't start it — ask for clarification first.

---

## 3. Tech Stack

- **Frontend:** Next.js + TypeScript, Tailwind CSS
- **Backend/DB:** Supabase (Postgres, Auth, Storage, Row-Level Security)
- **Structured data layer:** O*NET Web Services (REST/JSON)
- **AI — extraction:** LLM API, output validated with Zod before anything touches the database
- **AI — rubric grading:** LLM API against a fixed, versioned rubric (never a free-form prompt)
- **Deterministic grading:** sandboxed Postgres/SQLite instance, seeded with fixed data
- **Deploy:** Vercel

---

## 4. Data Model

Initial Supabase migration. RLS must be enabled on every table before any feature code is written against it.

```sql
create table career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  current_stage text,              -- student / early-career / switcher
  target_career_id text,           -- O*NET SOC code
  source text,                     -- resume-built / resume-uploaded / manual
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table user_skills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references career_profiles not null,
  skill_id text not null,
  claimed_level int,                            -- 0-100, self-reported
  evidence_type text not null default 'self_reported', -- self_reported | ai_assessed | verified
  evidence_score int,
  evidence_source text,                         -- challenge_id, or 'user_claim'
  verified_at timestamptz
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null,
  type text not null,                 -- 'deterministic' | 'rubric'
  grading_spec jsonb not null
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges not null,
  profile_id uuid references career_profiles not null,
  result_score int,
  result_detail jsonb,
  created_at timestamptz default now()
);

-- Enable RLS on all four tables, with policies scoping every row
-- to auth.uid() = the owning user_id (via career_profiles.user_id).
```

**Downstream enforcement rules (application code, not just schema):**
- Resume generator: `evidence_type IN ('verified') OR (evidence_type = 'self_reported' AND user_confirmed_include = true)`
- Career Proof score: only `evidence_type IN ('verified', 'ai_assessed')` counts
- `self_reported` skills are visibly labeled as unverified everywhere in the UI

---

## 5. MVP Scope — 9 Features, In Order

| # | Feature | Depends on |
|---|---|---|
| 1 | Free resume builder (build-here default, upload secondary) | — |
| 2 | Career Profile | #1 |
| 3 | One target career selection | #2 |
| 4 | Skill-gap analysis (O*NET-sourced) | #3 |
| 5 | Claimed vs. evidence-backed skills | #4 |
| 6 | One deterministic challenge (SQL) | #5 |
| 7 | One rubric-based challenge | #5 |
| 8 | Career Proof score | #6, #7 |
| 9 | Career Passport | #8 |

---

## 6. Explicitly Out of Scope

Do not build, suggest, or scaffold placeholders for:
- Job-board integration / live job data (Adzuna, Remotive, etc.)
- Voice-based mock interviews
- Application tailoring / cover letter generation
- Portfolio hosting (public shareable pages)
- Payments / subscription billing
- Viral funnel (Career Reality Check, Career Identity Map) — pending, see Section 10
- Multiple target careers per user
- University/B2B dashboards

If a task seems to require one of these, stop and flag it.

---

## 7. First End-to-End User Flow

1. User builds or uploads a resume
2. If uploaded: confirm/edit screen before anything saves
3. Chooses a target career (default test/demo: **Financial Analyst**, O*NET SOC 13-2051.00)
4. Sees skill gaps from O*NET, each labeled with its source
5. Claims a skill (e.g., SQL) → `user_skills` row, `evidence_type = 'self_reported'`
6. Completes the SQL challenge
7. Graded deterministically against seeded data
8. On pass, `evidence_type` → `'verified'`, `verified_at` set
9. Career Proof score recalculates (verified/ai_assessed only)
10. Career Passport reflects the new evidence, labeled by type

---

## 8. Build Sequence

Each task's "done" condition must be shown, not claimed.

1. **Initialize Next.js + TypeScript, deploy empty shell to Vercel.** *Done:* blank page live at a real URL.
2. **Supabase: Auth, Postgres, RLS project-wide.** *Done:* test user can sign up/log in; a second user cannot see the first's data via direct API query.
3. **Run the Section 4 migration.** *Done:* four tables with RLS; cross-user read verified denied.
4. **Resume builder — build-here.** Manual form (education, experience, skills, projects), PDF export, one ATS-friendly template. *Done:* downloadable PDF with zero AI involvement.
5. **Resume builder — upload.** PDF/DOCX text extraction → LLM structured extraction → confirm/edit → only then save. *Done:* a messy resume never silently saves a wrong field.
6. **O*NET integration** for Financial Analyst (13-2051.00). *Done:* requirements stored/cached and queryable.
7. **Target career selection screen.** *Done:* selection recorded on `career_profiles`.
8. **Skill-gap calculation.** Required − claimed, weighted by O*NET importance. *Done:* matches a hand-calculated expected result.
9. **`user_skills` wiring.** Claims default to `self_reported`. *Done:* visible in Career Profile UI, labeled unverified.
10. **Deterministic SQL challenge.** Seeded dataset, expected-output checker, sandboxed. *Done:* correct → `verified`; incorrect → not, with explanation.
11. **Rubric-based challenge.** LLM against a fixed rubric. *Done:* per-criterion score, labeled `ai_assessed`, visually distinct from `verified`.
12. **Career Proof score.** *Done:* self-reported skill doesn't change score; completing a challenge does.
13. **Career Passport page.** *Done:* self-reported vs verified distinguishable at a glance.
14. **Resume generator update.** *Done:* unproven skill excluded unless explicitly opted in via a visible flag.
15. **Security review pass** (hostile reviewer; rank Critical/High/Medium/Low; fix Critical+High; regression tests).
16. **Edge-case pass** (malformed resumes, failed submissions, O*NET failures, low-confidence extraction — fail visibly, never silently).

---

## 9. Working Method

- One Section 8 task per session/prompt.
- After tasks 5, 10, 11, 14: dedicated review pass before moving on.
- Reject any shortcut violating Section 2 (e.g., LLM grading SQL).

---

## 10. Pending Decisions — Flagged, Not Blocking

- **Geography-first:** South Asia vs U.S./global-English. Until decided, UI copy says "based on global occupational data."
- **Viral funnel branch:** depends on geography. Not in this build.
- **Pricing/billing:** no payment infrastructure in this MVP.

Never decide these by default — stop and ask.
