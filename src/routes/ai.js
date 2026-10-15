const express = require('express');
const router = express.Router();

/**
 * AI-assisted HTML email template generation, via the Anthropic API.
 * Requires ANTHROPIC_API_KEY to be set (see .env.example).
 */

const SYSTEM_PROMPT = `You write HTML emails for regningoutbounn.dk, a Danish company selling electricity
agreements (el-aftaler) and add-on subscription products to its existing customers.

Brand: forest-green (#14532d) and mint (#2f9e6e) accents, clean and simple, no stock-photo clutter.
Audience: existing customers, written in Danish unless the request says otherwise.
Output: reply with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{"subject": "...", "html": "..."}

Rules for the html field:
- A complete, self-contained HTML email: inline CSS only (no <style> blocks, no external stylesheets —
  most email clients strip them), table-based or simple div layout that renders consistently across clients.
- Use {{name}} and other {{placeholder}} tokens for anything that should be personalized per recipient
  (e.g. {{name}}, {{amount}}, {{date}}) — never invent a fake specific name or number.
- Keep it genuinely usable: a real subject line and real body copy for the scenario described, not placeholder
  lorem ipsum.
- Do not include tracking pixels, hidden text, or anything designed to defeat spam filters — write a normal,
  honest transactional/marketing email a real customer would expect to receive.`;

router.post('/generate-template', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Describe what the email should say.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({
      error: 'ANTHROPIC_API_KEY is not set. Add it as an environment variable (see .env.example) to use AI generation.',
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.trim() }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Anthropic API error: ${response.status} ${errText.slice(0, 300)}` });
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || '').join('').trim();

    let parsed;
    try {
      // Strip accidental markdown fences, just in case
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'AI response was not valid JSON. Try rephrasing your request.' });
    }

    if (!parsed.subject || !parsed.html) {
      return res.status(502).json({ error: 'AI response was missing subject or html.' });
    }

    res.json({ subject: parsed.subject, html: parsed.html });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

module.exports = router;
