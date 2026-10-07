import { after } from "next/server";
import { denied } from "@/lib/auth";
import { checkReplies } from "@/lib/replies";
import { rememberReply } from "@/lib/agent37";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  try {
    const replies = await checkReplies();
    const fresh = replies.filter((r) => r.isNew);
    // Tell the user's Agent37 agent who replied, so it can learn which people answer.
    if (fresh.length)
      after(async () => {
        for (const r of fresh) await rememberReply(r.name).catch((e) => console.error("[agent37] reply memo failed", e));
      });
    return Response.json({ ok: true, replies });
  } catch (e: any) {
    console.error("[replies]", e);
    return Response.json({ ok: false, error: e?.message ?? "reply check failed", replies: [] }, { status: 500 });
  }
}
