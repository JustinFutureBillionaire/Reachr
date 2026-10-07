import { db, DEMO_USER_ID } from "./db";

async function turn(input: string) {
  const { data: u, error } = await db.from("users").select("agent37_url, session_id").eq("id", DEMO_USER_ID).single();
  if (error) throw error;
  if (!u.agent37_url) throw new Error("No Agent37 instance yet: run scripts/check/agent37.ts once");
  const res = await fetch(`${u.agent37_url}/v1/responses`, {
    method: "POST",
    headers: { "X-Agent37-Key": process.env.AGENT37_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ input, ...(u.session_id && { session_id: u.session_id }) }),
  });
  const r = await res.json();
  // Failed turns come back as HTTP 200 with status "failed".
  if (r.status !== "completed") throw new Error(`Agent37 turn ${r.status}: ${JSON.stringify(r.error ?? r)}`);
  if (!u.session_id) await db.from("users").update({ session_id: r.session_id }).eq("id", DEMO_USER_ID);
  return { text: r.output_text as string, cost: (r.usage?.cost_usd as number) ?? 0 };
}

export async function planQueries(goal: string, background: string, excluded: string[]) {
  const { text, cost } = await turn(`You are Reachr, an outreach research agent for one user. Remember this user's goals and everyone you have suggested or that they contacted.
Goal: ${goal}
User background: ${background}
Never suggest again: ${excluded.join(", ") || "(none)"}
Return ONLY JSON: {"queries": ["...", "...", "...", "...", "..."]}
Each query is a LinkedIn post search keyword string: role + topic + place when relevant, 3-6 words. Make them diverse.`);
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`Agent37 returned no JSON: ${text}`);
  const queries = (JSON.parse(json).queries as string[]).filter(Boolean).slice(0, 5);
  return { queries, cost };
}

export async function rememberContacted(name: string, org: string | null, goal: string) {
  const date = new Date().toISOString().slice(0, 10);
  return turn(`The user contacted: ${name} (${org ?? "unknown org"}) about "${goal}" on ${date}. Remember this and never suggest them again.`);
}
