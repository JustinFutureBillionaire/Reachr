import { llmJson, obj } from "./llm";
import type { Person } from "./collect";

const int = { type: "integer" };

export async function filter(goal: string, background: string, people: Person[]) {
  const list = people.map((p, i) => ({ i, name: p.name, headline: p.title, evidence: p.evidence.slice(0, 600) }));
  const r = await llmJson<{ keep: { i: number; org: string | null }[] }>(
    process.env.OPENAI_MODEL_FAST!,
    "filter",
    obj({ keep: { type: "array", items: obj({ i: int, org: { type: ["string", "null"] } }) } }),
    `You filter outreach candidates for this goal: ${goal}. User background: ${background}.
Use ONLY each candidate's headline and evidence. Never invent facts.
Drop: companies, duplicates, recruiters and job ads (unless the goal is hiring), anyone clearly unrelated to the goal.
Keep at most 15, best matches first. For each kept candidate give its index i and org: the organization they work at, taken from the headline or post; null if not stated.
Candidates: ${JSON.stringify(list)}`
  );
  const seen = new Set<number>();
  return r.keep
    .filter((k) => people[k.i] && !seen.has(k.i) && seen.add(k.i))
    .slice(0, 15)
    .map((k) => ({ ...people[k.i], org: k.org || null }));
}

export type Scored = Person & {
  email: string | null;
  fit: number;
  reply_reason: number;
  recency: number;
  reachability: number;
  total: number;
  hook: string;
};

export async function score(goal: string, background: string, people: (Person & { email: string | null })[]) {
  const list = people.map((p, i) => ({ i, name: p.name, headline: p.title, org: p.org, has_email: !!p.email, evidence: p.evidence }));
  const r = await llmJson<{ scores: { i: number; fit: number; reply_reason: number; recency: number; reachability: number; hook: string }[] }>(
    process.env.OPENAI_MODEL_SMART!,
    "score",
    obj({ scores: { type: "array", items: obj({ i: int, fit: int, reply_reason: int, recency: int, reachability: int, hook: { type: "string" } }) } }),
    `You evaluate outreach candidates for this goal: ${goal}. User background: ${background}.
Use ONLY each candidate's evidence. Never invent facts.
Score every candidate 1-5 on:
- fit: how well they match the goal
- reply_reason: a specific, real reason THIS person would answer THIS user
- recency: active recently, based on the evidence
- reachability: a realistic public contact path (has_email = true -> 5; no email -> at most 2)
For each, write hook: one sentence on why they would reply, citing the evidence.
Candidates: ${JSON.stringify(list)}`
  );
  const clamp = (n: number, max = 5) => Math.max(1, Math.min(max, Math.round(n)));
  const seen = new Set<number>();
  return r.scores
    .filter((s) => people[s.i] && !seen.has(s.i) && seen.add(s.i))
    .map((s): Scored => {
      const p = people[s.i];
      const sc = {
        fit: clamp(s.fit),
        reply_reason: clamp(s.reply_reason),
        recency: clamp(s.recency),
        reachability: p.email ? 5 : clamp(s.reachability, 2), // enforce the rule, don't trust the model
      };
      return { ...p, ...sc, total: sc.fit + sc.reply_reason + sc.recency + sc.reachability, hook: s.hook };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}
