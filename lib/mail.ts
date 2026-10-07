import nodemailer from "nodemailer";

const mail = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// When DEMO_REDIRECT_TO is set, every email goes there and nowhere else.
export async function sendMail(to: string, name: string, subject: string, body: string) {
  const redirect = process.env.DEMO_REDIRECT_TO || null;
  const sentTo = redirect ?? to;
  const text = redirect ? `[Reachr demo redirect] Original recipient: ${name} <${to}>\n\n${body}` : body;
  await mail.sendMail({ from: process.env.GMAIL_USER, to: sentTo, subject, text });
  return { sentTo, redirected: !!redirect };
}
