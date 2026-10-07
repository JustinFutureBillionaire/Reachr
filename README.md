# Reachr

**Give it a goal. Get 10 people with a sourced reason to reply, and an email that connects their work to yours.**

## The workflow it replaces
Finding the right people for a specific purpose (user interviews for a project, a job or internship, a mentor, a collaborator), then researching and writing to each one. That's ~20 minutes per person on LinkedIn and the web; 10 people is 3+ hours a week, so everyone procrastinates it.

Reachr does the finding, the research and the writing. You only approve.

## How it works
1. **Plan**: a per-user Agent37 agent turns your goal into 5 LinkedIn search queries. It remembers everyone it has suggested and everyone you contacted, so it never suggests them again.
2. **Search**: Monid runs LinkedIn post search, one query per run. We search *posts*, not profiles: someone who just wrote about your topic cares about it now, and the post is real, sourced evidence for the email.
3. **Filter**: OpenAI drops companies, duplicates, recruiters and off-goal people.
4. **Find email**: Hunter (via Monid) finds a work email from the LinkedIn handle.
5. **Score**: OpenAI scores fit, reason to reply, recency and reachability, then keeps the top 10, each with a one-line hook that cites the post.
6. **Draft**: a 4-sentence email. Facts about them come only from their post; facts about you come only from your real assets.
7. **Approve**: "Why this email" shows which sentence came from their post and which came from your profile. Approve sends it through Gmail. For people without an email, "Open in LinkedIn" copies the draft and opens their post, and you send the DM yourself (no LinkedIn automation).

## Why not Apollo / Clay?
They optimize sales volume (lists of 50). Reachr optimizes one reply from the right person: 10 people, every claim backed by a source, a human approves every send.

## Stack and sponsors
- **Agent37**: per-user agent instance with session memory (planning + who was contacted)
- **Monid**: data layer (LinkedIn post search via Apify, email finder via Hunter)
- **OpenAI**: filter, score and draft with structured outputs
- **Supabase**: users, assets, runs, candidates (RLS on, server-only service role)
- Next.js + TypeScript, nodemailer (Gmail SMTP)

## Run it
```bash
npm install
npm install -g @monid-ai/cli
cp .env.example .env        # fill in keys
# paste supabase/schema.sql into the Supabase SQL editor
npx tsx scripts/seed.ts     # seed the demo user + assets from seed/assets.json
npm run check               # connectivity: OpenAI, Supabase, Monid, Agent37, Gmail
npm run dev                 # http://localhost:3000
```
Terminal-only: `npx tsx scripts/run-full.ts "<goal>"`.

While `DEMO_REDIRECT_TO` is set, every email goes to that address, with the original recipient noted at the top (cards without a found email can then also be approved, as a demo fallback). On a public deploy, set `APP_PASSCODE`: every API call then needs it (the page asks once).
