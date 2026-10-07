import { after } from "next/server";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { rememberContacted } from "@/lib/agent37";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { candidateId, subject, body } = await req.json().catch(() => ({}));
  if (typeof candidateId !== "string" || typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim())
    return Response.json({ ok: false, error: "candidateId, subject and body required" }, { status: 400 });
  const { data: c } = await db.from("candidates").select("name,org,email,channel,run_id").eq("id", candidateId).maybeSingle();
  if (!c) return Response.json({ ok: false, error: "candidate not found" }, { status: 404 });
  if (c.channel !== "email" || !c.email) return Response.json({ ok: false, error: "no email for this candidate" }, { status: 400 });
  try {
    const { sentTo, redirected } = await sendMail(c.email, c.name, subject, body);
    await db.from("candidates").update({ subject, body, status: "contacted" }).eq("id", candidateId);
    after(async () => {
      const { data: run } = await db.from("runs").select("goal").eq("id", c.run_id).single();
      await rememberContacted(c.name, c.org, run?.goal ?? "").catch((e) => console.error("[agent37] remember failed", e));
    });
    return Response.json({ ok: true, sentTo, redirected });
  } catch (e: any) {
    console.error("[send]", e);
    return Response.json({ ok: false, error: e?.message ?? "send failed" }, { status: 500 });
  }
}
