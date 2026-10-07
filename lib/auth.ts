import { timingSafeEqual } from "node:crypto";

// Optional passcode for the public deploy (paid APIs + Gmail behind it). Unset = open, for local dev.
export function denied(req: Request) {
  const want = process.env.APP_PASSCODE;
  if (!want) return null;
  const got = Buffer.from(req.headers.get("x-reachr-passcode") ?? "");
  const exp = Buffer.from(want);
  if (got.length === exp.length && timingSafeEqual(got, exp)) return null;
  return Response.json({ ok: false, error: "passcode required" }, { status: 401 });
}
