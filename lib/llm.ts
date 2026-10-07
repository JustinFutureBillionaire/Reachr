import OpenAI from "openai";

const openai = new OpenAI();

// ponytail: process-wide counter; concurrent runs share it (pipeline reads the delta). Fine for a one-user demo.
export const usage = { tokens: 0 };

// Responses API + strict structured output. `schema` must be a strict JSON schema
// (every property required, additionalProperties false; nullable = type [x, "null"]).
export async function llmJson<T>(model: string, name: string, schema: object, input: string): Promise<T> {
  const r = await openai.responses.create({
    model,
    input,
    text: { format: { type: "json_schema", name, schema: schema as Record<string, unknown>, strict: true } },
  });
  usage.tokens += r.usage?.total_tokens ?? 0;
  return JSON.parse(r.output_text) as T;
}

export const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
