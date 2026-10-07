# PLAN.md — Reachr

## 1. Product
**One line:** Reachr is a personal outreach agent. Give it a goal; it returns 10 people with a real, sourced reason to reply, drafts an email that connects their recent work to your real assets, and sends it when you approve.

**Workflow it replaces:** finding the right people for a specific purpose (user interviews for a project, a job or internship, a mentor, a collaborator) and then researching and writing to each one. ~20 min per person on LinkedIn/web, 10 people ≈ 3+ hours a week. Everyone procrastinates it. Reachr automates the finding, the research and the email; the human only approves.

**Why it is different from Apollo/Clay:** they optimize sales volume (lists of 50). Reachr optimizes one reply from the right person: purpose-driven goals (interviewees for a project, hiring managers, mentors, collaborators, investors), 10 people, every claim backed by a source, human approval before sending.

**Who pays:** students and early founders ($29/mo); career centers and accelerators (per seat).

## 2. Architecture (pipeline)
1. **Input**: goal + one-line user background.
2. **Plan** (Agent37 instance): turn the goal into 5 LinkedIn search keyword strings, excluding people already suggested. The instance keeps a session per user, so it remembers past runs and contacts.
3. **Collect** (Monid `apify /harvestapi/linkedin-post-search`, backend): one Monid run per keyword, max 8 results each. Normalize to people (keep author LinkedIn profile URL). Source today: LinkedIn only.
4. **Filter** (OpenAI FAST): drop duplicates, companies, clear mismatches. Keep ≤ 15.
5. **Find email** (Monid `hunterio /email-finder`, by `linkedin_handle` or name + company; ~$0.025 only when found, free on miss). Found → `channel = email`. None → `channel = linkedin_dm`.
6. **Score** (OpenAI SMART): 1–5 on fit, reply_reason, recency, reachability (found email = high reachability, so email people rank first). Top 10 by total. Add `hook`.
7. **Match** (OpenAI): pick the 1–2 user assets that best overlap each person's evidence.
8. **Draft** (OpenAI SMART): 4-sentence email (or 300-char LinkedIn note).
9. **Approve → Send**: `email` → nodemailer/Gmail on Approve. `linkedin_dm` → "Open in LinkedIn" button copies the draft to clipboard and opens their profile; the user pastes and sends by hand (LinkedIn has no public messaging API and automating it breaks their ToS and risks bans — never automate LinkedIn sending). Either way status → `contacted`; tell the Agent37 instance who was contacted.
10. *(Vision, not built today)*: weekly auto-run, reply tracking, follow-ups after 3 days, more sources (X/Twitter, Google, GitHub, Crunchbase via Monid), more channels (Instagram DM). Today: LinkedIn search, email sending, manual LinkedIn DM.

Sponsors: Agent37 (per-user agent + memory, required), Monid (data), OpenAI (filter/score/draft), Supabase (storage), InstaCloud (deploy, only if time).

## 3. Data model (supabase/schema.sql, RLS on, no policies; service role only)
- `users`: id uuid pk, name text, background text, agent37_instance_id text, agent37_url text, session_id text
- `user_assets`: id uuid pk, user_id uuid, type text (project | achievement | skill | link), title text, one_liner text, url text, tags text[]
- `runs`: id uuid pk, user_id uuid, goal text, status text, agent_cost_usd numeric, monid_cost_usd numeric, openai_cost_usd numeric, created_at timestamptz default now()
- `candidates`: id uuid pk, run_id uuid, user_id uuid, name text, title text, org text, platform text, source_url text, evidence text, fit int, reply_reason int, recency int, reachability int, total int, hook text, email text, channel text (email | linkedin_dm), subject text, body text, used_evidence text, used_assets text[], status text default 'suggested' (suggested | contacted | replied), created_at timestamptz default now()

Seed: one demo user + `seed/assets.json` into `user_assets`.

## 4. External APIs

### Agent37
- Create instance (once): `POST https://api.agent37.com/v1/instances`, header `Authorization: Bearer $AGENT37_KEY`, body `{"budget":{"credit_micros":1000000}}`. Response has `id`, `url`, `status: "running"`. Save to `users`.
- Run a turn: `POST {url}/v1/responses`, header `X-Agent37-Key: $AGENT37_KEY`, body `{"input": "...", "session_id": "<saved or omit first time>"}`. Non-streaming returns one JSON body. Streaming (`"stream": true`) emits SSE: `response.created` (has `session_id`), `response.output_text.delta`, `response.completed` (has `output_text`, `usage.cost_usd`).
- Instance boots async: poll `GET {url}/v1/health` until `healthy: true` before the first turn. Failed turns return HTTP 200 with `status: "failed"`; always check `status === "completed"`.
- Save `session_id` on first call and reuse it every run.
- **Created (Step 1):** instance `jzywbr409f` (`https://jzywbr409f.agent37.app`), id/url/session_id saved on the demo user row. Never create another.
- Reference: https://www.agent37.com/docs/llms-full.txt

### Monid (CLI, from backend)
- Find: `monid discover -q "linkedin posts" -j` and `monid discover -q "email finder" -j`
- Inspect (mandatory before use): `monid inspect -p <provider> -e <endpoint> -j` → `input.body`, `input.queryParams`, `input.pathParams`
- Run: `monid run -p <provider> -e <endpoint> -i '<json body>' -w 60 -j` → result items + `cost.value`
- Limits apply per search term, not per call. One term per call. Start with max 8.
- Auth: no env var. `monid keys add -k $MONID_KEY -l main` once (scripts/check/monid.ts does it via execFile).
- Run result JSON: `status` (`COMPLETED`), `output[]` (items), `cost.value`, `resultCount`.

#### Chosen endpoint 1: `apify /harvestapi/linkedin-post-search` (inspected + one real run)
- POST body: `{"searchQueries":["<one query>"],"maxPosts":8,"postedLimit":"month"}` (other options: `sortBy`, `authorKeywords`, `authorsCompanies`; not needed today).
- Price $0.0092/result + tiny flat fee → ~$0.074 per query, ~$0.37 per run (5 queries). Took ~8s.
- Useful fields per item: `type` ("post"), `linkedinUrl` (post link = source_url), `content` (post text = evidence), `postedAt.date`, `author.type` ("profile" | "company"), `author.name`, `author.publicIdentifier` (LinkedIn handle), `author.info` (headline = title), `author.website`. There is no separate org field; the scorer infers org from the headline/post.
- Observed noise: recruiter / job-ad posts (first test result was a recruiter). Filter must drop recruiters and job ads unless the goal is hiring.

#### Chosen endpoint 2: `hunterio /email-finder` (inspected, not yet run)
- GET, pass via `--query` (not `-i`): `{"linkedin_handle":"<author.publicIdentifier>","max_duration":10}`; or `first_name`+`last_name` / `full_name` with `domain` | `company`.
- Returns `email` (null on miss), confidence 0-100, deliverability (valid / accept_all / unknown), job title, company.
- Price $0.0245 only when found; a miss is free. ≤15 lookups per run → ≤ ~$0.37.

#### Estimated cost per full run
Agent37 ~$0 (measured $0 on test turns) + Monid search ~$0.37 + Hunter ≤ ~$0.37 + OpenAI (small) ≈ under $1.
- Reference: https://monid.ai/SKILL.md

### Gmail
- nodemailer SMTP `smtp.gmail.com:465`, auth GMAIL_USER / GMAIL_APP_PASSWORD.
- If DEMO_REDIRECT_TO is set, every email goes there, with the original recipient noted at the top of the body.

## 5. Prompts

### 5.1 Planner (sent to Agent37 instance)
```
You are Reachr, an outreach research agent for one user. Remember this user's goals and everyone you have suggested or that they contacted.
Goal: {goal}
User background: {background}
Never suggest again: {excluded_names}
Return ONLY JSON: {"queries": ["...", "...", "...", "...", "..."]}
Each query is a LinkedIn post search keyword string: role + topic + place when relevant, 3-6 words. Make them diverse.
```

### 5.2 Contacted memo (sent to Agent37 instance after Approve)
```
The user contacted: {name} ({org}) about "{goal}" on {date}. Remember this and never suggest them again.
```

### 5.3 Filter + score (OpenAI, structured output)
```
You evaluate outreach candidates for this goal: {goal}. User background: {background}.
Use ONLY each candidate's evidence. Never invent facts.
First drop: companies, duplicates, recruiters and job ads (unless the goal is hiring), anyone clearly unrelated to the goal.
Score the rest 1-5 on:
- fit: how well they match the goal
- reply_reason: a specific, real reason THIS person would answer THIS user
- recency: active recently, based on the evidence
- reachability: a realistic public contact path (has_email = true → 5; no email → at most 2)
For each, write hook: one sentence on why they would reply, citing the evidence.
Return the top 10 by total.
```

### 5.4 Asset match + draft (OpenAI, structured output)
```
Write a cold email from {user_name} to {name}.
Their evidence (the ONLY facts you may use about them): {evidence} ({source_url})
My assets (the ONLY facts you may use about me): {all_assets_json}
Goal: {goal}
Step 1: choose the 1-2 assets that best connect to their evidence.
Step 2: write 4 sentences, under 110 words.
 1. Reference their specific recent work.
 2. Connect it to one chosen asset.
 3. One small ask (a 15-minute call).
 4. An easy out.
No flattery. No invented facts. Subject under 7 words.
If channel is linkedin_dm: same structure, max 300 characters, no subject.
Return JSON: {"subject","body","used_evidence","used_assets"}
```

## 6. Build steps (do in order; verify before moving on)

**Time check: build started late (≈2:52). Compressed timeline below.**

### Step 1 — Setup + connectivity ✅ DONE (3:30)
- Scaffold Next.js TS; install `@supabase/supabase-js openai nodemailer dotenv tsx`.
- Write `supabase/schema.sql` (section 3) → user pastes in Supabase SQL editor.
- `scripts/check/{openai,supabase,monid,agent37,gmail}.ts`: tiny completion; insert+select; discover "linkedin posts" and "email finder" (print top 5 with provider/endpoint/health); create ONE Agent37 instance, save to users, send "Reply with OK", print reply + session_id; send test email to DEMO_REDIRECT_TO.
- **Done when** all 5 checks pass and the user picks the LinkedIn + email-finder endpoints.
- Result: `npm run check` passes all 5. Models: FAST `gpt-5.4-mini`, SMART `gpt-5.5`. Endpoints chosen (section 4).

### Step 2 — Collect (now: 3:40 → ~3:50) — code drafted, NOT run/verified, not committed
- `lib/agent37.ts`: `planQueries(goal, background, excluded)`, `rememberContacted(...)`, reuse session_id.
- `lib/monid.ts`: `runEndpoint(provider, endpoint, input)` → items + cost. Run queries in parallel.
- `lib/collect.ts`: normalize → {name, title (headline), org (null), platform, source_url (post), profile_url, linkedin_handle, evidence ("(posted YYYY-MM-DD) " + content ≤1500 chars)}. Skip `author.type = company`, dedupe by handle, drop excluded names, max 40.
- `scripts/run-collect.ts "<goal>"` → prints count, first 5, costs; saves `out/candidates.json`.
- **Done when** ≥ 20 candidates, all with source_url and real evidence text.

### Step 3 — Filter + email + score + draft (~3:50 → ~4:00)
- **Needs from user first:** one-line background + 3-6 real assets (type, title, one_liner, url) → `seed/assets.json` → `user_assets`. Never invent assets.
- Order: filter (FAST, ≤15) → `lib/email-find.ts` (Hunter by linkedin_handle; miss → linkedin_dm) → `lib/score.ts` (5.3, with has_email) → top 10 → `lib/draft.ts` (5.4).
- `scripts/run-full.ts "<goal>"` → saves run + 10 candidates to Supabase, prints all drafts.
- **Done when** drafts reference real evidence and only real assets.

### Step 4 — UI + Approve/Send (~4:00 → 4:05 FREEZE; likely needs cut order section 7)
- `POST /api/run` with SSE step logs ("Planning queries", "Searched LinkedIn: N people", "Filtered to 15", "Scored top 10", "Drafted 10 emails").
- Single page: left = goal/background, Run, live log. Right = 10 cards (name, title, org, score, hook, source link, email or "LinkedIn DM", editable subject/body, "Why this email" toggle showing used_evidence + used_assets, Approve for email cards / "Open in LinkedIn" (copy draft + open profile) for linkedin_dm cards).
- `POST /api/send` → nodemailer (respect DEMO_REDIRECT_TO, show "demo redirect" badge) → status contacted → `rememberContacted`.
- "Load last run" button (reads latest run from Supabase, no re-run).
- Footer: run cost (Agent37 + Monid + OpenAI) and "Saved ~3h (10 people × 20 min)".
- **Done when** Run → cards → Approve → email arrives on phone.

### Step 5 — Freeze + submit prep (4:05–4:15)
- README (pitch, workflow replaced, architecture, sponsors, how to run). Secret check. Push to GitHub. Only fix bugs on the demo path.

## 7. Cut order if behind (cut from the top)
1. UI polish → plain styling, or terminal demo + Supabase table view.
2. SSE streaming → simple loading state + log printed after.
3. Email finder → all cards send to DEMO_REDIRECT_TO only.
4. Agent37 session memory → still create instance and call planQueries (Agent37 use is mandatory for eligibility).
**Never cut:** sourced evidence + real-asset drafts, and one real Approve → email sent.

## 8. Demo (3 min)
1. Problem (20s): "Six weeks in SF. Every cold email started with 20 minutes of research. Ten people is three hours a week."
2. Solution (20s): "Reachr: give it a goal, get ten people with a sourced reason to reply and an email that connects their work to yours."
3. Live (80s): type goal → Run → log flows → Load last run → open one card → "Why this email" (this sentence from their post, this one from my project) → Approve → phone notification.
4. Architecture (20s): per-user Agent37 agent that remembers who you contacted; Monid for data; OpenAI to filter, score and write; Supabase stores it.
5. Numbers (20s): measured run cost vs ~3 hours saved. Only measured numbers.
6. Vision (20s): runs every Monday, learns from who replies, sold to career centers and accelerators.

Likely Q&A: vs Apollo/Clay (reply quality, not volume) · LinkedIn legality (data via providers through Monid, no direct scraping, no automated LinkedIn messages — user sends DMs by hand) · why an agent (stateful, weekly, remembers contacts) · reply rate (not measured yet; next metric).
