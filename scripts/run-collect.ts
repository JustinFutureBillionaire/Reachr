import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db, DEMO_USER_ID } from "../lib/db";
import { planQueries } from "../lib/agent37";
import { collect } from "../lib/collect";

const goal = process.argv[2];
const background = process.argv[3] ?? "Student building AI agents";
if (!goal) throw new Error('usage: npx tsx scripts/run-collect.ts "<goal>" ["<background>"]');

const { data: prev } = await db.from("candidates").select("name").eq("user_id", DEMO_USER_ID);
const excluded = [...new Set((prev ?? []).map((c) => c.name))];

console.log("Planning queries…");
const plan = await planQueries(goal, background, excluded);
console.log("queries:", plan.queries);

console.log("Searching LinkedIn…");
const { people, cost, failed } = await collect(plan.queries, excluded);
console.log(`\n${people.length} people (${failed} failed searches)`);
for (const p of people.slice(0, 5)) console.log(`\n- ${p.name} | ${p.title}\n  ${p.source_url}\n  ${p.evidence.slice(0, 160).replace(/\s+/g, " ")}…`);
console.log(`\ncost: agent37 $${plan.cost.toFixed(4)}, monid $${cost.toFixed(4)}`);

writeFileSync("out/candidates.json", JSON.stringify({ goal, background, queries: plan.queries, people }, null, 2));
console.log("saved out/candidates.json");
