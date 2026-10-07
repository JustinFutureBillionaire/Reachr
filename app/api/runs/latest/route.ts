import { denied } from "@/lib/auth";
import { db, DEMO_USER_ID } from "@/lib/db";
import { CANDIDATE_COLS } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  const { data: run } = await db
    .from("runs")
    .select("id,goal,agent_cost_usd,monid_cost_usd")
    .eq("user_id", DEMO_USER_ID)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return Response.json({ runId: null });
  const { data: candidates, error } = await db.from("candidates").select(CANDIDATE_COLS).eq("run_id", run.id).order("total", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    runId: run.id,
    goal: run.goal,
    candidates,
    costs: { agent37: Number(run.agent_cost_usd ?? 0), monid: Number(run.monid_cost_usd ?? 0), openai_tokens: 0 },
    demoRedirect: process.env.DEMO_REDIRECT_TO || null,
  });
}
