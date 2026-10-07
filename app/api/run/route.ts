import { denied } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  const { goal } = await req.json().catch(() => ({}));
  if (typeof goal !== "string" || !goal.trim()) return Response.json({ error: "goal required" }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const emit = (e: object) => {
        try {
          c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {} // client went away; keep running so the run still gets saved
      };
      await runPipeline(goal.trim(), emit);
      try {
        c.close();
      } catch {}
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
