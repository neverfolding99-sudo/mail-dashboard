const express = require('express');
const router = express.Router();
const db = require('../db/init');

router.get('/', (req, res) => {
  const { status, limit } = req.query;
  let query = 'SELECT * FROM messages';
  const params = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Number(limit) || 200);
  res.json(db.prepare(query).all(...params));
});

router.get('/stats', (req, res) => {
  const rows = db
    .prepare(`SELECT status, COUNT(*) as count FROM messages GROUP BY status`)
    .all();
  const stats = { queued: 0, sent: 0, failed: 0 };
  for (const r of rows) stats[r.status] = r.count;
  res.json(stats);
});

module.exports = router;
