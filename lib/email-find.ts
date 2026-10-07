import { runEndpoint } from "./monid";

// Hunter output (checked with one real run): { data: { email, score, company, position, linkedin_url, ... } }.
// Miss or failure -> email null, never throws.
export async function findEmail(linkedin_handle: string) {
  const r = await runEndpoint("hunterio", "/email-finder", { query: { linkedin_handle, max_duration: 10 } });
  const d = (r?.items as any)?.data;
  return { email: (d?.email as string) || null, company: (d?.company as string) || null, cost: r?.cost ?? 0 };
}
