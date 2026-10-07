import { after } from "next/server";
import { db } from "@/lib/db";
import { rememberContacted } from "@/lib/agent37";

export const runtime = "nodejs";

// linkedin_dm cards: the user sends the DM by hand; we only record it.
export async function POST(req: Request) {
  const { candidateId } = await req.json().catch(() => ({}));
  if (typeof candidateId !== "string") return Response.json({ ok: false, error: "candidateId required" }, { status: 400 });
  const { data: c, error } = await db.from("candidates").update({ status: "contacted" }).eq("id", candidateId).select("name,org,run_id").maybeSingle();
  if (error || !c) return Response.json({ ok: false, error: error?.message ?? "candidate not found" }, { status: 404 });
  after(async () => {
    const { data: run } = await db.from("runs").select("goal").eq("id", c.run_id).single();
    await rememberContacted(c.name, c.org, run?.goal ?? "").catch((e) => console.error("[agent37] remember failed", e));
  });
  return Response.json({ ok: true });
}
