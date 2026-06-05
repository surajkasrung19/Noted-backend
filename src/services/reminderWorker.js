import cron from "node-cron";
import nodemailer from "nodemailer";
import Reminder from "../models/Reminder.js";
import { escapeHtml } from "../utils/text.js";

function smtpHost() {
  return process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
}

function smtpPort() {
  return Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
}

function smtpUser() {
  return process.env.SMTP_USER || process.env.BREVO_SMTP_USER || "";
}

function smtpPass() {
  return process.env.SMTP_PASS || process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD || "";
}

function smtpConfigured() {
  return Boolean(smtpUser() && smtpPass());
}

function createSmtpTransport() {
  if (!smtpConfigured()) return null;

  const port = smtpPort();
  return nodemailer.createTransport({
    host: smtpHost(),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      user: smtpUser(),
      pass: smtpPass()
    },
    authMethod: process.env.SMTP_AUTH_METHOD || "LOGIN"
  });
}

function fromAddress() {
  return (
    process.env.SMTP_FROM ||
    process.env.SMTP_FROM_EMAIL ||
    process.env.BREVO_FROM ||
    process.env.BREVO_FROM_EMAIL ||
    process.env.FROM_EMAIL ||
    (smtpConfigured() ? smtpUser() : "") ||
    "Noted <no-reply@noted.app>"
  );
}

function reminderEmail(reminder) {
  const title = reminder.note?.title || "Untitled note";
  const safeTitle = escapeHtml(title);
  const appUrl = process.env.CLIENT_URL || "http://localhost:5173";

  return {
    from: fromAddress(),
    to: reminder.email,
    subject: `Reminder: ${title}`,
    text: `You asked Noted to remind you about: ${title}\n\nOpen Noted: ${appUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#202124">
        <h2 style="margin:0 0 12px">Reminder: ${safeTitle}</h2>
        <p>You asked Noted to remind you about this note.</p>
        <p><a href="${appUrl}" style="color:#256f6c">Open Noted</a></p>
      </div>
    `
  };
}

async function sendReminderEmail(reminder) {
  const mail = reminderEmail(reminder);
  const smtp = createSmtpTransport();

  if (!smtp) {
    console.error("Brevo SMTP reminder email is not configured. Set SMTP_USER and SMTP_PASS.");
    return false;
  }

  if (smtp) {
    try {
      await smtp.sendMail(mail);
      return true;
    } catch (error) {
      console.error(`SMTP reminder failed for ${reminder.email}:`, error.message || error);
      return false;
    }
  }
}

export function startReminderWorker() {
  cron.schedule("* * * * *", async () => {
    const due = await Reminder.find({
      sentAt: null,
      remindAt: { $lte: new Date() },
      email: { $ne: "" }
    }).populate("note");

    if (!due.length) return;

    await Promise.all(
      due.map(async (reminder) => {
        const sent = await sendReminderEmail(reminder);
        if (!sent) return;

        reminder.sentAt = new Date();
        await reminder.save();
      })
    );
  });
}
