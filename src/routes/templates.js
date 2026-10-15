const express = require('express');
const router = express.Router();
const db = require('../db/init');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { name, subject, html } = req.body;
  if (!name || !subject || !html) {
    return res.status(400).json({ error: 'name, subject and html are required' });
  }
  const info = db
    .prepare('INSERT INTO templates (name, subject, html) VALUES (?, ?, ?)')
    .run(name, subject, html);
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, subject, html } = req.body;
  db.prepare(
    `UPDATE templates SET name = ?, subject = ?, html = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, subject, html, req.params.id);
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
