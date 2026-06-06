import nodemailer from "nodemailer";
import { escapeHtml } from "../utils/text.js";

function smtpHost() {
  return process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
}

function primarySmtpPort() {
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

function smtpPortCandidates() {
  const primary = primarySmtpPort();
  const ports = [primary];
  const host = smtpHost().toLowerCase();

  if (host.includes("brevo") && !ports.includes(2525)) {
    ports.push(2525);
  }

  return ports;
}

function createSmtpTransport(port) {
  if (!smtpConfigured()) return null;

  return nodemailer.createTransport({
    host: smtpHost(),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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

function appUrl(path = "") {
  const base = process.env.CLIENT_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}

function smtpFailureReason(error) {
  const message = String(error?.message || error || "");

  if (message.includes("525") || message.toLowerCase().includes("unauthorized ip")) {
    return "Brevo rejected this server IP address. In Brevo, open Settings > Security > Authorized IPs and authorize this server/Render outbound IP, or turn off SMTP IP blocking for SMTP keys.";
  }

  if (error?.code === "EAUTH" || message.includes("535")) {
    return "Brevo rejected the SMTP login. Copy the SMTP login from Brevo's SMTP & API page into SMTP_USER and copy an SMTP key into SMTP_PASS. Do not use your Gmail address, Brevo account password, or Brevo API key.";
  }

  return message || "SMTP could not send the email";
}

async function sendAuthEmail({ to, subject, title, body, actionText, actionUrl }) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const actionMarkup = actionUrl
    ? `
        <p>
          <a href="${actionUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#13776d;color:#fff;text-decoration:none">
            ${escapeHtml(actionText)}
          </a>
        </p>
      `
    : "";
  const mail = {
    from: fromAddress(),
    to,
    subject,
    text: actionUrl ? `${title}\n\n${body}\n\n${actionText}: ${actionUrl}` : `${title}\n\n${body}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2933">
        <h2 style="margin:0 0 12px">${safeTitle}</h2>
        <p>${safeBody}</p>
        ${actionMarkup}
        <p style="color:#64748b;font-size:13px">If you did not request this email, you can ignore it.</p>
      </div>
    `
  };

  if (smtpConfigured()) {
    let lastError;
    for (const port of smtpPortCandidates()) {
      const smtp = createSmtpTransport(port);

      if (!smtp) continue;

    try {
      const info = await smtp.sendMail(mail);
      console.log(`SMTP auth email sent to ${to} on port ${port}: ${info.messageId}`);
      return { sent: true, id: info.messageId, provider: "smtp" };
    } catch (error) {
        lastError = error;
        console.error(`SMTP auth email failed for ${to} on port ${port}:`, error.message || error);
      if (error.code === "EAUTH" || String(error.message || "").includes("535")) {
        return {
          sent: false,
          reason: smtpFailureReason(error)
        };
      }
      }
    }

    return { sent: false, reason: smtpFailureReason(lastError) };
  }

  return { sent: false, reason: "Brevo SMTP credentials are required. Set SMTP_USER and SMTP_PASS." };
}

export function sendWelcomeEmail(user) {
  return sendAuthEmail({
    to: user.email,
    subject: "Welcome to Noted",
    title: "Welcome to Noted",
    body: `Hi ${user.name}, your private notes workspace is ready. Capture drafts, days, reminders, and stories whenever they arrive.`,
    actionText: "Open Noted",
    actionUrl: appUrl("/")
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
