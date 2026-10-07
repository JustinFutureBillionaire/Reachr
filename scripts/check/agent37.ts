import "dotenv/config";
import { db, DEMO_USER_ID } from "../../lib/db";

const KEY = process.env.AGENT37_KEY!;
const { data: user, error } = await db.from("users").select("*").eq("id", DEMO_USER_ID).single();
if (error) throw error;

let { agent37_instance_id: id, agent37_url: url, session_id } = user;
if (!id) {
  // Credits are limited: create exactly ONE instance, then reuse it forever.
  const res = await fetch("https://api.agent37.com/v1/instances", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "reachr-demo", user: DEMO_USER_ID, budget: { credit_micros: 1000000 } }),
  });
  const inst = await res.json();
  if (!res.ok) throw new Error(`create instance ${res.status}: ${JSON.stringify(inst)}`);
  ({ id, url } = inst);
  const save = await db.from("users").update({ agent37_instance_id: id, agent37_url: url }).eq("id", DEMO_USER_ID);
  if (save.error) throw save.error;
  console.log("created instance", id, url);
} else {
  console.log("reusing instance", id, url);
}

const headers = { "X-Agent37-Key": KEY, "Content-Type": "application/json" };
for (let i = 0; i < 30; i++) {
  const h = await fetch(`${url}/v1/health`, { headers }).then((r) => r.json()).catch(() => null);
  if (h?.healthy) break;
  if (i === 29) throw new Error("instance not healthy after 60s");
  await new Promise((r) => setTimeout(r, 2000));
}

const res = await fetch(`${url}/v1/responses`, {
  method: "POST",
  headers,
  body: JSON.stringify({ input: "Reply with OK", ...(session_id && { session_id }) }),
});
const turn = await res.json();
if (turn.status !== "completed") throw new Error(`turn ${turn.status}: ${JSON.stringify(turn.error ?? turn)}`);
if (!session_id) {
  const save = await db.from("users").update({ session_id: turn.session_id }).eq("id", DEMO_USER_ID);
  if (save.error) throw save.error;
}
console.log({ reply: turn.output_text, session_id: turn.session_id, cost_usd: turn.usage?.cost_usd });
