import nodemailer from "nodemailer";
import { Resend } from "resend";
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

function createResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  return new Resend(process.env.RESEND_API_KEY);
}

function fromAddress() {
  return (
    process.env.SMTP_FROM ||
    process.env.SMTP_FROM_EMAIL ||
    process.env.BREVO_FROM ||
    process.env.BREVO_FROM_EMAIL ||
    process.env.FROM_EMAIL ||
    (smtpConfigured() ? smtpUser() : "") ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.RESEND_FROM ||
    "Noted <onboarding@resend.dev>"
  );
}

function appUrl(path = "") {
  const base = process.env.CLIENT_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function sendAuthEmail({ to, subject, title, body, actionText, actionUrl }) {
  const resend = createResendClient();
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const mail = {
    from: fromAddress(),
    to,
    subject,
    text: `${title}\n\n${body}\n\n${actionText}: ${actionUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2933">
        <h2 style="margin:0 0 12px">${safeTitle}</h2>
        <p>${safeBody}</p>
        <p>
          <a href="${actionUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#13776d;color:#fff;text-decoration:none">
            ${escapeHtml(actionText)}
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">This link expires soon. If you did not request it, you can ignore this email.</p>
      </div>
    `
  };

  const smtp = createSmtpTransport();
  if (smtp) {
    try {
      const info = await smtp.sendMail(mail);
      return { sent: true, id: info.messageId, provider: "smtp" };
    } catch (error) {
      console.error(`SMTP auth email failed for ${to}:`, error.message || error);
      if (error.code === "EAUTH" || String(error.message || "").includes("535")) {
        return {
          sent: false,
          reason:
            "Brevo rejected the SMTP login. Copy the SMTP login from Brevo's SMTP & API page into SMTP_USER and copy an SMTP key into SMTP_PASS. Do not use your Gmail address, Brevo account password, or Brevo API key."
        };
      }
      return { sent: false, reason: error.message || "SMTP could not send the email" };
    }
  }

  if (!resend) {
    return { sent: false, reason: "SMTP credentials or RESEND_API_KEY are required" };
  }

  const { data, error } = await resend.emails.send({
    ...mail
  });

  if (error) {
    console.error(`Resend auth email failed for ${to}:`, error.message || error);
    return { sent: false, reason: error.message || "Resend could not send the email" };
  }

  return { sent: true, id: data?.id, provider: "resend" };
}

export function sendVerificationEmail(user, token) {
  return sendAuthEmail({
    to: user.email,
    subject: "Verify your Noted email",
    title: "Verify your Noted email",
    body: `Hi ${user.name}, confirm this email address to protect your private notes workspace.`,
    actionText: "Verify email",
    actionUrl: appUrl(`/?verifyToken=${encodeURIComponent(token)}`)
  });
}

export function sendPasswordResetEmail(user, token) {
  return sendAuthEmail({
    to: user.email,
    subject: "Reset your Noted password",
    title: "Reset your Noted password",
    body: `Hi ${user.name}, use this secure link to create a new password for your Noted account.`,
    actionText: "Reset password",
    actionUrl: appUrl(`/?resetToken=${encodeURIComponent(token)}`)
  });
}
