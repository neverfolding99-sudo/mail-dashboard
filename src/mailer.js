const nodemailer = require('nodemailer');

/**
 * Provider-agnostic transport layer.
 * Each provider is a standard SMTP relay (AWS SES, Mailjet, Postmark, Brevo, ...).
 * Configure as many as you have credentials for via environment variables —
 * see .env.example. Unconfigured providers are simply skipped.
 */

function buildProviders() {
  const providers = {};

  if (process.env.SES_SMTP_USER && process.env.SES_SMTP_PASS) {
    providers.ses = {
      label: 'Amazon SES',
      transport: nodemailer.createTransport({
        host: process.env.SES_SMTP_HOST || 'email-smtp.eu-north-1.amazonaws.com',
        port: Number(process.env.SES_SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SES_SMTP_USER, pass: process.env.SES_SMTP_PASS },
      }),
    };
  }

  if (process.env.MAILJET_SMTP_USER && process.env.MAILJET_SMTP_PASS) {
    providers.mailjet = {
      label: 'Mailjet',
      transport: nodemailer.createTransport({
        host: process.env.MAILJET_SMTP_HOST || 'in-v3.mailjet.com',
        port: Number(process.env.MAILJET_SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.MAILJET_SMTP_USER, pass: process.env.MAILJET_SMTP_PASS },
      }),
    };
  }

  if (process.env.POSTMARK_SMTP_USER && process.env.POSTMARK_SMTP_PASS) {
    providers.postmark = {
      label: 'Postmark',
      transport: nodemailer.createTransport({
        host: process.env.POSTMARK_SMTP_HOST || 'smtp.postmarkapp.com',
        port: Number(process.env.POSTMARK_SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.POSTMARK_SMTP_USER, pass: process.env.POSTMARK_SMTP_PASS },
      }),
    };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    providers.default = {
      label: process.env.SMTP_LABEL || 'Default relay',
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      }),
    };
  }

  return providers;
}

const providers = buildProviders();

// Order to try, for fallback sending: configurable via PROVIDER_ORDER, e.g. "postmark,mailjet,ses"
const fallbackOrder = (process.env.PROVIDER_ORDER || Object.keys(providers).join(','))
  .split(',')
  .map((s) => s.trim())
  .filter((key) => providers[key]);

function listProviders() {
  return Object.entries(providers).map(([key, p]) => ({ key, label: p.label }));
}

/**
 * Send one email.
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.provider] - specific provider key to use; if omitted, tries fallbackOrder in sequence
 * @param {string} [opts.senderName] - display name for this send (same name for the whole batch —
 *   this is NOT per-recipient rotation, just a one-time override of MAIL_FROM_NAME)
 */
async function sendMail({ to, subject, html, provider, senderName }) {
  const from = `"${senderName || process.env.MAIL_FROM_NAME || 'regningoutbounn.dk'}" <${process.env.MAIL_FROM_ADDRESS}>`;

  const tryKeys = provider ? [provider] : fallbackOrder;
  if (tryKeys.length === 0) {
    throw new Error('No SMTP relay configured. Set credentials in .env (see .env.example).');
  }

  let lastError;
  for (const key of tryKeys) {
    const p = providers[key];
    if (!p) continue;
    try {
      const info = await p.transport.sendMail({ from, to, subject, html });
      return { ok: true, provider: key, messageId: info.messageId };
    } catch (err) {
      lastError = err;
      // try next provider in the fallback chain
    }
  }
  throw lastError || new Error('Send failed: no working provider.');
}

module.exports = { sendMail, listProviders };
