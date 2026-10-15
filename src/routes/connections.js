const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { clearTransportCache } = require('../mailer');

// Never return the password in list/get responses.
function sanitize(row) {
  if (!row) return row;
  const { password, ...rest } = row;
  return { ...rest, hasPassword: Boolean(password) };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM smtp_connections ORDER BY created_at DESC').all();
  res.json(rows.map(sanitize));
});

router.post('/', (req, res) => {
  const { label, host, port, username, password, fromAddress, fromName, isDefault } = req.body;
  if (!label || !host || !username || !password || !fromAddress) {
    return res.status(400).json({ error: 'label, host, username, password and fromAddress are required' });
  }
  if (isDefault) {
    db.prepare('UPDATE smtp_connections SET is_default = 0').run();
  }
  const info = db
    .prepare(
      `INSERT INTO smtp_connections (label, host, port, username, password, from_address, from_name, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(label, host, port || 587, username, password, fromAddress, fromName || null, isDefault ? 1 : 0);
  clearTransportCache();
  res.json(sanitize(db.prepare('SELECT * FROM smtp_connections WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const { label, host, port, username, password, fromAddress, fromName, isDefault } = req.body;
  const existing = db.prepare('SELECT * FROM smtp_connections WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (isDefault) {
    db.prepare('UPDATE smtp_connections SET is_default = 0').run();
  }

  db.prepare(
    `UPDATE smtp_connections
     SET label = ?, host = ?, port = ?, username = ?, password = ?, from_address = ?, from_name = ?, is_default = ?
     WHERE id = ?`
  ).run(
    label || existing.label,
    host || existing.host,
    port || existing.port,
    username || existing.username,
    password || existing.password, // keep old password if left blank in the edit form
    fromAddress || existing.from_address,
    fromName != null ? fromName : existing.from_name,
    isDefault ? 1 : existing.is_default,
    req.params.id
  );
  clearTransportCache();
  res.json(sanitize(db.prepare('SELECT * FROM smtp_connections WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM smtp_connections WHERE id = ?').run(req.params.id);
  clearTransportCache();
  res.json({ ok: true });
});

module.exports = router;
