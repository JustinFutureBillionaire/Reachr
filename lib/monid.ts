import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Endpoints were checked with `monid inspect` (see PLAN.md section 4).
// A failed run is logged and returns null; it never crashes the pipeline.
export async function runEndpoint(provider: string, endpoint: string, opts: { body?: object; query?: object }) {
  const args = ["run", "-p", provider, "-e", endpoint, "-w", "60", "-j"];
  if (opts.body) args.push("-i", JSON.stringify(opts.body));
  if (opts.query) args.push("--query", JSON.stringify(opts.query));
  try {
    const { stdout } = await run("monid", args, { maxBuffer: 50 * 1024 * 1024, timeout: 90_000 });
    const r = JSON.parse(stdout);
    if (r.status !== "COMPLETED") throw new Error(`status ${r.status}`);
    return { items: (r.output ?? []) as any[], cost: (r.cost?.value as number) ?? 0 };
  } catch (e: any) {
    console.error(`[monid] ${provider}${endpoint} failed: ${e.stderr || e.message}`);
    return null;
  }
}
