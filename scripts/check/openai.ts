import "dotenv/config";
import OpenAI from "openai";

const openai = new OpenAI();
for (const model of [process.env.OPENAI_MODEL_FAST!, process.env.OPENAI_MODEL_SMART!]) {
  const r = await openai.responses.create({ model, input: "Reply with exactly: OK" });
  console.log(`${model}: ${r.output_text.trim()}`);
}
