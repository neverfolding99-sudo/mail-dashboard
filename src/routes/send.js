const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMail } = require('../mailer');

function applyPlaceholders(str, data) {
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => (data && data[key] != null ? data[key] : ''));
}

/**
 * Body:
 * {
 *   templateId?: number,          // use a saved template
 *   subject?: string, html?: string, // or send ad-hoc content
 *   recipients: [{ email: string, data?: {name: 'X', amount: '123'} }, ...],
 *   provider?: 'ses' | 'mailjet' | 'postmark' | 'default'  // optional explicit choice
 * }
 */
router.post('/', async (req, res) => {
  const { templateId, subject: rawSubject, html: rawHtml, recipients, provider, senderName } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients[] is required' });
  }

  let subject = rawSubject;
  let html = rawHtml;

  if (templateId) {
    const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    subject = subject || t.subject;
    html = html || t.html;
  }

  if (!subject || !html) {
    return res.status(400).json({ error: 'subject and html are required (directly or via templateId)' });
  }

  const results = [];

  for (const r of recipients) {
    const personalizedSubject = applyPlaceholders(subject, r.data);
    const personalizedHtml = applyPlaceholders(html, r.data);

    const insert = db
      .prepare(
        `INSERT INTO messages (template_id, recipient, subject, html, status) VALUES (?, ?, ?, ?, 'queued')`
      )
      .run(templateId || null, r.email, personalizedSubject, personalizedHtml);
    const messageId = insert.lastInsertRowid;

    try {
      const result = await sendMail({
        to: r.email,
        subject: personalizedSubject,
        html: personalizedHtml,
        provider,
        senderName,
      });
      db.prepare(
        `UPDATE messages SET status = 'sent', sent_at = datetime('now') WHERE id = ?`
      ).run(messageId);
      results.push({ email: r.email, status: 'sent', provider: result.provider });
    } catch (err) {
      db.prepare(`UPDATE messages SET status = 'failed', error = ? WHERE id = ?`).run(
        String(err.message || err),
        messageId
      );
      results.push({ email: r.email, status: 'failed', error: String(err.message || err) });
    }
  }

  res.json({ results });
});

module.exports = router;
