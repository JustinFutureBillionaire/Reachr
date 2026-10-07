import { ImapFlow } from "imapflow";
import { db, DEMO_USER_ID } from "./db";

// lib/mail.ts sends with Message-ID <reachr-{candidateId}@reachr.app>; a reply's In-Reply-To carries it back.
const TAG = /<reachr-([0-9a-f-]{36})@reachr\.app>/;

export type Reply = { candidateId: string; name: string; from: string; subject: string; date: string | null; isNew: boolean };

// Reads the Gmail inbox over IMAP (same app password as SMTP) and marks replied candidates.
export async function checkReplies(days = 7): Promise<Reply[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    logger: false,
  });
  await client.connect();
  const found = new Map<string, { from: string; subject: string; date: string | null }>();
  const lock = await client.getMailboxLock("INBOX");
  try {
    // ponytail: scans envelopes of the last `days` of INBOX each check; fine for a personal inbox, use Gmail push if it gets slow.
    for await (const m of client.fetch({ since: new Date(Date.now() - days * 864e5) }, { envelope: true })) {
      const id = m.envelope?.inReplyTo?.match(TAG)?.[1];
      const f = m.envelope?.from?.[0];
      if (id) found.set(id, { from: f?.name || f?.address || "", subject: m.envelope?.subject ?? "", date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  if (!found.size) return [];
  const { data } = await db.from("candidates").select("id,name,status").eq("user_id", DEMO_USER_ID).in("id", [...found.keys()]);
  const fresh = (data ?? []).filter((c) => c.status !== "replied").map((c) => c.id as string);
  if (fresh.length) await db.from("candidates").update({ status: "replied" }).in("id", fresh);
  return (data ?? []).map((c) => ({ candidateId: c.id, name: c.name, ...found.get(c.id)!, isNew: fresh.includes(c.id) }));
}
