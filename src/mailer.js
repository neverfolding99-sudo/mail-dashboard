const nodemailer = require('nodemailer');
const db = require('./db/init');

/**
 * Transport layer. Relay credentials come from one of two places:
 *  1. Saved connections in the dashboard's Settings tab (smtp_connections table) — this is
 *     the normal path now.
 *  2. Environment variables (SES_SMTP_*, MAILJET_SMTP_*, POSTMARK_SMTP_*, SMTP_*) — kept for
 *     anyone who'd rather configure it via Render's environment instead of the UI.
 * Both sources are merged into one list of providers you can pick from when sending.
 */

const transportCache = new Map(); // key -> nodemailer transport, rebuilt when a connection changes

function envProviders() {
  const providers = [];

  if (process.env.SES_SMTP_USER && process.env.SES_SMTP_PASS) {
    providers.push({
      key: 'env:ses',
      label: 'Amazon SES (env)',
      host: process.env.SES_SMTP_HOST || 'email-smtp.eu-north-1.amazonaws.com',
      port: Number(process.env.SES_SMTP_PORT || 587),
      user: process.env.SES_SMTP_USER,
      pass: process.env.SES_SMTP_PASS,
    });
  }
  if (process.env.MAILJET_SMTP_USER && process.env.MAILJET_SMTP_PASS) {
    providers.push({
      key: 'env:mailjet',
      label: 'Mailjet (env)',
      host: process.env.MAILJET_SMTP_HOST || 'in-v3.mailjet.com',
      port: Number(process.env.MAILJET_SMTP_PORT || 587),
      user: process.env.MAILJET_SMTP_USER,
      pass: process.env.MAILJET_SMTP_PASS,
    });
  }
  if (process.env.POSTMARK_SMTP_USER && process.env.POSTMARK_SMTP_PASS) {
    providers.push({
      key: 'env:postmark',
      label: 'Postmark (env)',
      host: process.env.POSTMARK_SMTP_HOST || 'smtp.postmarkapp.com',
      port: Number(process.env.POSTMARK_SMTP_PORT || 587),
      user: process.env.POSTMARK_SMTP_USER,
      pass: process.env.POSTMARK_SMTP_PASS,
    });
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    providers.push({
      key: 'env:default',
      label: process.env.SMTP_LABEL || 'Default relay (env)',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    });
  }
  return providers;
}

function savedProviders() {
  const rows = db.prepare('SELECT * FROM smtp_connections ORDER BY is_default DESC, created_at ASC').all();
  return rows.map((r) => ({
    key: `saved:${r.id}`,
    label: r.label,
    host: r.host,
    port: r.port,
    user: r.username,
    pass: r.password,
    fromAddress: r.from_address,
    fromName: r.from_name,
    isDefault: Boolean(r.is_default),
  }));
}

function allProviders() {
  // saved (dashboard-configured) connections first, then anything set via env vars
  return [...savedProviders(), ...envProviders()];
}

function listProviders() {
  return allProviders().map((p) => ({ key: p.key, label: p.label }));
}

function getTransport(provider) {
  if (transportCache.has(provider.key)) return transportCache.get(provider.key);
  const transport = nodemailer.createTransport({
    host: provider.host,
    port: provider.port,
    secure: Number(provider.port) === 465,
    auth: { user: provider.user, pass: provider.pass },
  });
  transportCache.set(provider.key, transport);
  return transport;
}

// Call this whenever a saved connection is added/edited/deleted so a stale transport isn't reused.
function clearTransportCache() {
  transportCache.clear();
}

/**
 * Send one email.
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.provider] - specific provider key to use; if omitted, uses the default
 *   saved connection, then falls through the rest in order
 * @param {string} [opts.senderName] - display name for this send (same name for the whole batch)
 */
async function sendMail({ to, subject, html, provider, senderName }) {
  const providers = allProviders();
  if (providers.length === 0) {
    throw new Error('No SMTP relay configured. Add one in Settings, or via environment variables.');
  }

  const tryList = provider ? providers.filter((p) => p.key === provider) : providers;
  if (tryList.length === 0) {
    throw new Error(`Unknown provider "${provider}".`);
  }

  let lastError;
  for (const p of tryList) {
    const fromAddress = p.fromAddress || process.env.MAIL_FROM_ADDRESS || p.user;
    const fromName = senderName || p.fromName || process.env.MAIL_FROM_NAME || 'regningoutbounn.dk';
    const from = `"${fromName}" <${fromAddress}>`;
    try {
      const info = await getTransport(p).sendMail({ from, to, subject, html });
      return { ok: true, provider: p.key, messageId: info.messageId };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Send failed: no working provider.');
}

/**
 * Verify a connection without sending anything (SMTP handshake + auth check only).
 * @param {string} providerKey
 */
async function testConnection(providerKey) {
  const p = allProviders().find((x) => x.key === providerKey);
  if (!p) throw new Error(`Unknown provider "${providerKey}".`);
  await getTransport(p).verify(); // throws with the real SMTP error (auth failed, connection refused, etc.)
  return { ok: true };
}

module.exports = { sendMail, listProviders, clearTransportCache, testConnection };
