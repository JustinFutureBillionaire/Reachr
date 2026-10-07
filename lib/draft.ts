import { llmJson, obj } from "./llm";

export type Asset = { type: string; title: string; one_liner: string | null; url: string | null; tags: string[] | null };
export type Draft = { subject: string | null; body: string; used_evidence: string; used_assets: string[] };

export async function draft(
  user: { name: string; background: string },
  assets: Asset[],
  goal: string,
  c: { name: string; evidence: string; source_url: string; channel: "email" | "linkedin_dm" }
) {
  const dm = c.channel === "linkedin_dm";
  const d = await llmJson<Draft>(
    process.env.OPENAI_MODEL_SMART!,
    "draft",
    obj({
      subject: { type: ["string", "null"] },
      body: { type: "string" },
      used_evidence: { type: "string" },
      used_assets: { type: "array", items: { type: "string" } },
    }),
    `Write a ${dm ? "LinkedIn connection note" : "cold email"} from ${user.name} to ${c.name}.
Their evidence (the ONLY facts you may use about them): ${c.evidence} (${c.source_url})
My background and assets (the ONLY facts you may use about me): ${user.background}
${JSON.stringify(assets)}
Goal: ${goal}
Step 1: choose the 1-2 assets that best connect to their evidence.
Step 2: write 4 sentences${dm ? "" : ", under 110 words"}.
 1. Reference their specific recent work.
 2. Connect it to one chosen asset.
 3. One small ask (a 15-minute call).
 4. An easy out.
No flattery. No invented facts. ${dm ? "Max 300 characters total, subject must be null." : "Subject under 7 words."}
Sign off with ${user.name}.
used_evidence: the exact short quote from their evidence you referenced. used_assets: titles of the assets you used.`
  );
  return { ...d, subject: dm ? null : d.subject };
}
