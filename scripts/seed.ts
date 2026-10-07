import "dotenv/config";
import { readFileSync } from "node:fs";
import { db, DEMO_USER_ID } from "../lib/db";

// Only real facts the user gave us. Never add assets that aren't in seed/assets.json.
const seed = JSON.parse(readFileSync("seed/assets.json", "utf8"));
const u = await db.from("users").update({ name: seed.name, background: seed.background }).eq("id", DEMO_USER_ID);
if (u.error) throw u.error;
const del = await db.from("user_assets").delete().eq("user_id", DEMO_USER_ID);
if (del.error) throw del.error;
const ins = await db.from("user_assets").insert(seed.assets.map((a: object) => ({ ...a, user_id: DEMO_USER_ID })));
if (ins.error) throw ins.error;
console.log(`seeded ${seed.name} with ${seed.assets.length} assets`);
