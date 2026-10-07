import { db, DEMO_USER_ID } from "./db";
import { planQueries } from "./agent37";
import { collect } from "./collect";
import { filter, score } from "./filter-score";
import { findEmail } from "./email-find";
import { draft, type Asset } from "./draft";
import { usage } from "./llm";

export const CANDIDATE_COLS =
  "id,name,title,org,source_url,evidence,fit,reply_reason,recency,reachability,total,hook,email,channel,subject,body,used_evidence,used_assets,status";

type Step = "plan" | "search" | "filter" | "email" | "score" | "draft" | "save";
export type Emit = (e: object) => void;

export async function runPipeline(goal: string, emit: Emit) {
  const step = (s: Step, status: "start" | "done", message: string, extra: object = {}) =>
    emit({ type: "step", step: s, status, message, ...extra });
  let runId: string | null = null;
  try {
    const { data: user, error: ue } = await db.from("users").select("name,background").eq("id", DEMO_USER_ID).single();
    if (ue) throw ue;
    const me = { name: user.name ?? "", background: user.background ?? "" };
    const { data: assets } = await db.from("user_assets").select("type,title,one_liner,url,tags").eq("user_id", DEMO_USER_ID);
    const { data: prev } = await db.from("candidates").select("name").eq("user_id", DEMO_USER_ID);
    const excluded = [...new Set((prev ?? []).map((c) => c.name as string))];

    const { data: run, error: re } = await db.from("runs").insert({ user_id: DEMO_USER_ID, goal, status: "running" }).select("id").single();
    if (re) throw re;
    runId = run.id as string;
    const tokens0 = usage.tokens;

    step("plan", "start", "Agent37 is planning LinkedIn searches");
    const { queries, cost: agentCost } = await planQueries(goal, me.background, excluded);
    step("plan", "done", `Planned ${queries.length} searches`, { items: queries });

    step("search", "start", "Searching LinkedIn posts via Monid");
    const found = await collect(queries, excluded);
    if (!found.people.length) throw new Error(`No people found on LinkedIn (${found.failed} searches failed)`);
    step("search", "done", `Found ${found.people.length} people`, { count: found.people.length });

    step("filter", "start", "Dropping companies, recruiters and mismatches");
    const kept = await filter(goal, me.background, found.people);
    step("filter", "done", `Kept ${kept.length}`, { count: kept.length });

    step("email", "start", "Looking up emails with Hunter");
    const lookups = await Promise.all(kept.map((p) => findEmail(p.linkedin_handle, p.name, p.org)));
    const withEmail = kept.map((p, i) => ({ ...p, email: lookups[i].email, org: p.org ?? lookups[i].company }));
    const emails = lookups.filter((l) => l.email).length;
    step("email", "done", `Found ${emails} emails`, { count: emails });

    step("score", "start", "Scoring fit, reply reason, recency, reachability");
    const top = await score(goal, me.background, withEmail);
    step("score", "done", `Top ${top.length} kept`, { count: top.length });

    step("draft", "start", "Writing personal emails");
    const drafts = await Promise.all(
      top.map((c) => draft(me, (assets ?? []) as Asset[], goal, { ...c, channel: c.email ? "email" : "linkedin_dm" }))
    );
    step("draft", "done", `Drafted ${drafts.length} messages`, { count: drafts.length });

    step("save", "start", "Saving to Supabase");
    const rows = top.map((c, i) => ({
      run_id: runId,
      user_id: DEMO_USER_ID,
      name: c.name,
      title: c.title,
      org: c.org,
      platform: c.platform,
      source_url: c.source_url,
      evidence: c.evidence,
      fit: c.fit,
      reply_reason: c.reply_reason,
      recency: c.recency,
      reachability: c.reachability,
      total: c.total,
      hook: c.hook,
      email: c.email,
      channel: c.email ? "email" : "linkedin_dm",
      ...drafts[i],
      status: "suggested",
    }));
    const { data: saved, error: ce } = await db.from("candidates").insert(rows).select(CANDIDATE_COLS);
    if (ce) throw ce;
    const monid = found.cost + lookups.reduce((s, l) => s + l.cost, 0);
    // OpenAI does not report cost; tokens are returned live but not stored (no column for them).
    await db.from("runs").update({ status: "done", agent_cost_usd: agentCost, monid_cost_usd: monid, openai_cost_usd: null }).eq("id", runId);
    step("save", "done", `Saved ${saved.length} candidates`, { count: saved.length });

    const done = {
      type: "done" as const,
      runId,
      goal,
      candidates: saved.sort((a, b) => b.total - a.total),
      costs: { agent37: agentCost, monid, openai_tokens: usage.tokens - tokens0 },
      demoRedirect: process.env.DEMO_REDIRECT_TO || null,
    };
    emit(done);
    return done;
  } catch (e: any) {
    console.error("[pipeline]", e);
    if (runId) await db.from("runs").update({ status: "error" }).eq("id", runId);
    emit({ type: "error", message: e?.message ?? String(e) });
    return null;
  }
}
