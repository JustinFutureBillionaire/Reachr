import { denied } from "@/lib/auth";
import { db, DEMO_USER_ID } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["project", "achievement", "skill", "link"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// The user's own facts. Drafts may only use what is saved here (CLAUDE.md rule 2).
export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  const { data: user } = await db.from("users").select("name,background").eq("id", DEMO_USER_ID).single();
  const { data: assets } = await db.from("user_assets").select("type,title,one_liner,url").eq("user_id", DEMO_USER_ID);
  return Response.json({ name: user?.name ?? "", background: user?.background ?? "", assets: assets ?? [] });
}

export async function PUT(req: Request) {
  const no = denied(req);
  if (no) return no;
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.assets)) return Response.json({ ok: false, error: "name, background, assets required" }, { status: 400 });
  const assets = b.assets
    .slice(0, 20)
    .map((a: Record<string, unknown>) => ({
      user_id: DEMO_USER_ID,
      type: TYPES.includes(a?.type as string) ? a.type : "project",
      title: str(a?.title, 120),
      one_liner: str(a?.one_liner, 400),
      url: str(a?.url, 300) || null,
    }))
    .filter((a: { title: string }) => a.title);
  const u = await db.from("users").update({ name: str(b.name, 80), background: str(b.background, 1000) }).eq("id", DEMO_USER_ID);
  if (u.error) return Response.json({ ok: false, error: u.error.message }, { status: 500 });
  // ponytail: replace-all save (delete + insert), fine for one user's handful of assets.
  const del = await db.from("user_assets").delete().eq("user_id", DEMO_USER_ID);
  if (del.error) return Response.json({ ok: false, error: del.error.message }, { status: 500 });
  if (assets.length) {
    const ins = await db.from("user_assets").insert(assets);
    if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
