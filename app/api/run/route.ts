import { denied } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  const { goal, filters } = await req.json().catch(() => ({}));
  if (typeof goal !== "string" || !goal.trim()) return Response.json({ error: "goal required" }, { status: 400 });
  // Optional filters, all grounded in data LinkedIn actually has. They ride along in the goal text,
  // so the planner, filter and scorer all see them. Recency maps to the search's postedLimit.
  const f = filters && typeof filters === "object" ? filters : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
  const parts = [
    str(f.location) && `Location: ${str(f.location)}`,
    str(f.role) && `Role: ${str(f.role)}`,
    str(f.industry) && `Industry: ${str(f.industry)}`,
  ].filter(Boolean);
  const fullGoal = parts.length ? `${goal.trim()} (${parts.join(" · ")})` : goal.trim();
  const postedLimit = ["24h", "week", "month"].includes(f.recency) ? f.recency : "month";
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const emit = (e: object) => {
        try {
          c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {} // client went away; keep running so the run still gets saved
      };
      await runPipeline(fullGoal, emit, postedLimit);
      try {
        c.close();
      } catch {}
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
