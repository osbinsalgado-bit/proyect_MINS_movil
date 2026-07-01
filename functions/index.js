"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

function getMailerConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error(
      "Missing SMTP configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM."
    );
  }

  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    from: SMTP_FROM,
  };
}

async function sendBrandedEmail(to, subject, institution, html) {
  const config = getMailerConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  const brandColor = institution.temaColorPrincipal || "#2563eb";
  const logoMarkup = institution.logoUrl
    ? `<img src="${institution.logoUrl}" alt="${institution.nombre}" style="max-width:140px;max-height:64px;display:block;margin:0 auto 16px;" />`
    : "";

  const wrappedHtml = `
    <div style="background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:${brandColor};padding:24px;text-align:center;color:#ffffff;">
          ${logoMarkup}
          <h1 style="margin:0;font-size:22px;">${institution.nombre}</h1>
        </div>
        <div style="padding:24px;line-height:1.6;">
          ${html}
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    html: wrappedHtml,
  });
}

exports.notifyAccessRequest = onCall(async (request) => {
  const { data } = request;
  const to = Array.isArray(data?.to)
    ? data.to.filter((value) => typeof value === "string" && value.trim())
    : [];
  const requesterEmail =
    typeof data?.requesterEmail === "string" ? data.requesterEmail.trim().toLowerCase() : "";
  const comment = typeof data?.comment === "string" ? data.comment.trim() : "";
  const institution = data?.institution || {};

  if (!requesterEmail || !requesterEmail.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid requesterEmail is required.");
  }

  if (!comment) {
    throw new HttpsError("invalid-argument", "A comment is required.");
  }

  if (!institution.id || !institution.nombre) {
    throw new HttpsError("invalid-argument", "Institution id and nombre are required.");
  }

  if (to.length === 0) {
    return { delivered: false, recipients: 0, skipped: true };
  }

  try {
    const subject = `Nueva Solicitud: ${institution.nombre}`;
    const html = `
      <p>Se ha recibido una nueva solicitud de acceso.</p>
      <p><strong>Correo solicitante:</strong> ${requesterEmail}</p>
      <p><strong>Institución:</strong> ${institution.nombre}</p>
      <p><strong>Motivo:</strong></p>
      <p>${comment.replace(/\n/g, "<br />")}</p>
    `;

    await sendBrandedEmail(to, subject, institution, html);

    return {
      delivered: true,
      recipients: to.length,
      skipped: false,
    };
  } catch (error) {
    logger.error("notifyAccessRequest failed", error);
    throw new HttpsError("internal", "Unable to send access request notification.");
  }
});
