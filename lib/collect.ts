import { runEndpoint } from "./monid";

export type Person = {
  name: string;
  title: string | null;
  org: string | null;
  platform: "linkedin";
  source_url: string;
  profile_url: string;
  linkedin_handle: string;
  evidence: string;
};

export async function collect(queries: string[], excluded: string[] = [], postedLimit = "month") {
  const runs = await Promise.all(
    queries.map((q) =>
      runEndpoint("apify", "/harvestapi/linkedin-post-search", {
        body: { searchQueries: [q], maxPosts: 8, postedLimit },
      })
    )
  );
  const skip = new Set(excluded.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const post of runs.flatMap((r) => r?.items ?? [])) {
    const a = post.author;
    if (post.type !== "post" || a?.type !== "profile" || !a.publicIdentifier || !post.content) continue;
    if (seen.has(a.publicIdentifier) || skip.has(String(a.name).toLowerCase())) continue;
    seen.add(a.publicIdentifier);
    people.push({
      name: a.name,
      title: a.info ?? null, // LinkedIn headline; org is inferred later by the scorer
      org: null,
      platform: "linkedin",
      source_url: post.linkedinUrl,
      profile_url: `https://www.linkedin.com/in/${a.publicIdentifier}`,
      linkedin_handle: a.publicIdentifier,
      evidence: `(posted ${post.postedAt?.date?.slice(0, 10) ?? "unknown"}) ${post.content.slice(0, 1500)}`,
    });
  }
  return {
    people: people.slice(0, 40),
    cost: runs.reduce((s, r) => s + (r?.cost ?? 0), 0),
    failed: runs.filter((r) => !r).length,
  };
}
