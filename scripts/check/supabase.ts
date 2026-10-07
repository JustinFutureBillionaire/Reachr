import "dotenv/config";
import { db, DEMO_USER_ID } from "../../lib/db";

const up = await db.from("users").upsert({ id: DEMO_USER_ID, name: "Demo User" }, { onConflict: "id", ignoreDuplicates: true });
if (up.error) throw up.error;
const { data, error } = await db.from("users").select("id, name, agent37_instance_id, session_id").eq("id", DEMO_USER_ID).single();
if (error) throw error;
console.log("demo user:", data);
for (const t of ["user_assets", "runs", "candidates"]) {
  const r = await db.from(t).select("id", { count: "exact", head: true });
  if (r.error) throw new Error(`${t}: ${r.error.message}`);
  console.log(`${t}: ${r.count} rows`);
}
