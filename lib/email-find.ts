import { runEndpoint } from "./monid";

// Hunter output (checked with one real run): { data: { email, score, company, position, linkedin_url, ... } }.
// Many LinkedIn handles aren't in Hunter's DB (404), so fall back to full name + company. Misses are free.
// Miss or failure -> email null, never throws.
async function hunter(query: object) {
  const r = await runEndpoint("hunterio", "/email-finder", { query: { ...query, max_duration: 10 } });
  const d = (r?.items as any)?.data;
  return { email: (d?.email as string) || null, company: (d?.company as string) || null, cost: r?.cost ?? 0 };
}

export async function findEmail(linkedin_handle: string, full_name?: string, org?: string | null) {
  const byHandle = await hunter({ linkedin_handle });
  if (byHandle.email || !full_name || !org) return byHandle;
  const byName = await hunter({ full_name, company: org });
  return { ...byName, cost: byHandle.cost + byName.cost };
}
