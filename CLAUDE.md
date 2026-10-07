# CLAUDE.md — Reachr

## What we are building
Reachr is an outreach agent built at a 2-hour hackathon ("Build an Agent", Agent37 / InsForge / Monid; sponsors OpenAI, Supabase).
The user types a goal (e.g. "AI agent founders in SF open to mentoring a student"). Reachr finds people worth contacting, explains why each would reply (with a source link), writes a cold email that mixes the person's recent activity with the user's own real assets, and sends it after the user clicks Approve.

Full spec, prompts, schema and build steps: see PLAN.md. Always read PLAN.md before starting a step.

## Hard deadline
Submissions close 4:40 PM PT. Feature freeze at 4:05 PM. A working demo path beats extra features every time.
Demo path that must always work: Run -> cards appear -> "Why this email" -> Approve -> email arrives.

## Stack
- Next.js (app router) + TypeScript, run with `npm run dev`
- Supabase (`@supabase/supabase-js`, service role key, server side only, RLS off)
- OpenAI SDK (structured outputs). Models from env: OPENAI_MODEL_FAST, OPENAI_MODEL_SMART
- Agent37 Cloud (per-user agent instance: plans searches, remembers who was suggested/contacted)
- Monid CLI (`monid`), called from the backend via child_process with `-j`
- nodemailer + Gmail SMTP (app password)
- Scripts run with `npx tsx scripts/...`

## Env vars (.env, already exists, gitignored — never print or commit values)
AGENT37_KEY, MONID_KEY, OPENAI_API_KEY, OPENAI_MODEL_FAST, OPENAI_MODEL_SMART, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, DEMO_REDIRECT_TO

## Rules
1. Work one step at a time (PLAN.md section 6). Finish a step, tell me exactly what to run to verify it, then stop.
2. Never invent facts about people or about the user. People facts come only from `evidence`; user facts come only from `user_assets`.
3. Never send email to anyone other than DEMO_REDIRECT_TO when that var is set. Never send without an explicit Approve click.
4. Monid: always `monid inspect` an endpoint before calling it. One search term per call, max 8 results. Use `-w 60`. A failed run is logged and skipped, never crashes the pipeline. Status values are UPPERCASE (`COMPLETED`).
5. Agent37: Hosting API `https://api.agent37.com/v1` with `Authorization: Bearer $AGENT37_KEY`; instance API `https://{id}.agent37.app` with header `X-Agent37-Key: $AGENT37_KEY`. Full reference: https://www.agent37.com/docs/llms-full.txt. Create only ONE instance (credits are limited) and reuse it.
6. Minimal UI, no auth, one seeded demo user. No new dependencies unless needed.
7. Small commits after each step. Check no secrets are committed.
8. If something blocks for more than 10 minutes, say so and propose the fallback in PLAN.md section 7.
