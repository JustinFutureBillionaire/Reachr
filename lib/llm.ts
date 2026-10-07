import OpenAI from "openai";

const openai = new OpenAI();

// ponytail: process-wide counter; concurrent runs share it (pipeline reads the delta). Fine for a one-user demo.
export const usage = { tokens: 0, usd: 0 };

// USD per 1M tokens, standard tier, from developers.openai.com/api/docs/pricing (checked 2026-10-07).
// A model missing here counts as $0 and is logged, so update this when OPENAI_MODEL_* changes.
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
};

// Responses API + strict structured output. `schema` must be a strict JSON schema
// (every property required, additionalProperties false; nullable = type [x, "null"]).
export async function llmJson<T>(model: string, name: string, schema: object, input: string): Promise<T> {
  const r = await openai.responses.create({
    model,
    input,
    text: { format: { type: "json_schema", name, schema: schema as Record<string, unknown>, strict: true } },
  });
  usage.tokens += r.usage?.total_tokens ?? 0;
  const p = PRICES[model];
  if (!p) console.warn(`[llm] no price for ${model}; counted as $0`);
  else if (r.usage) {
    const cached = r.usage.input_tokens_details?.cached_tokens ?? 0;
    usage.usd += ((r.usage.input_tokens - cached) * p.input + cached * p.cached + r.usage.output_tokens * p.output) / 1e6;
  }
  return JSON.parse(r.output_text) as T;
}

export const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
