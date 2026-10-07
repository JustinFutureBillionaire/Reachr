// Monid HTTP API (the same API the `monid` CLI calls). HTTP instead of the CLI so it also runs on Vercel.
// Endpoints were checked with `monid inspect` (see PLAN.md section 4).
// A failed run is logged and returns null; it never crashes the pipeline.
const BASE = "https://api.monid.ai";
const DONE = ["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIME_OUT"];

async function api(method: string, path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.MONID_KEY}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

export async function runEndpoint(provider: string, endpoint: string, opts: { body?: object; query?: object }) {
  try {
    const input: Record<string, object> = {};
    if (opts.body) input.body = opts.body;
    if (opts.query) input.queryParams = opts.query;
    let r = await api("POST", "/v1/run", { provider, endpoint, input });
    // Same as CLI `-w 60`: poll until a terminal status, max 60s.
    const deadline = Date.now() + 60_000;
    while (!DONE.includes(r.status) && Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 1500));
      r = await api("GET", `/v1/runs/${encodeURIComponent(r.runId)}`);
    }
    if (r.status !== "COMPLETED") throw new Error(`status ${r.status}`);
    return { items: (r.output ?? []) as any[], cost: (r.cost?.value as number) ?? 0 };
  } catch (e: any) {
    console.error(`[monid] ${provider}${endpoint} failed: ${e.message}`);
    return null;
  }
}
