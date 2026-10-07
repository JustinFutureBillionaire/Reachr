import "dotenv/config";
import { execFileSync } from "node:child_process";

const monid = (...args: string[]) => execFileSync("monid", [...args, "-j"], { encoding: "utf8" });

try {
  monid("whoami");
} catch {
  // Not authed yet: register the key from .env (execFile, so it never hits shell history).
  monid("keys", "add", "-k", process.env.MONID_KEY!, "-l", "main");
}
console.log("whoami:", monid("whoami").trim());

for (const q of ["linkedin posts", "email finder"]) {
  const out = JSON.parse(monid("discover", "-q", q, "-l", "5"));
  const items: any[] = Array.isArray(out) ? out : out.results ?? out.endpoints ?? out.data ?? out.items ?? [];
  console.log(`\n== discover "${q}"`);
  if (!items.length) console.log(JSON.stringify(out, null, 2).slice(0, 2000));
  for (const it of items.slice(0, 5)) {
    const { provider, endpoint, health, score, description, title, name } = it;
    console.log(JSON.stringify({ provider, endpoint, health, score, about: description ?? title ?? name }));
  }
  if (items.length && items[0].provider === undefined) console.log("raw first item:", JSON.stringify(items[0], null, 2));
}
