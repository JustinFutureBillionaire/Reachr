import "dotenv/config";
import { runPipeline } from "../lib/pipeline";

const goal = process.argv[2];
if (!goal) throw new Error('usage: npx tsx scripts/run-full.ts "<goal>"');

const r = await runPipeline(goal, (e: any) => {
  if (e.type !== "done") console.log(e.type === "step" ? `[${e.step} ${e.status}] ${e.message}${e.items ? " " + JSON.stringify(e.items) : ""}` : e);
});
if (!r) process.exit(1);
for (const c of r.candidates) {
  console.log(`\n=== ${c.total}/20 ${c.name} | ${c.org ?? "-"} | ${c.channel} ${c.email ?? ""}\n${c.source_url}\nhook: ${c.hook}`);
  console.log(`subject: ${c.subject}\n${c.body}\nused_evidence: ${c.used_evidence}\nused_assets: ${c.used_assets?.join(", ")}`);
}
console.log(`\nrun ${r.runId} costs:`, r.costs);
process.exit(0);
