import "dotenv/config";
import nodemailer from "nodemailer";

const to = process.env.DEMO_REDIRECT_TO;
if (!to) throw new Error("DEMO_REDIRECT_TO not set; refusing to send");
const mail = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});
const info = await mail.sendMail({ from: process.env.GMAIL_USER, to, subject: "Reachr check", text: "Gmail SMTP works." });
console.log("sent to", to, info.messageId);
