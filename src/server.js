require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db/init');
const { sendMail, listProviders } = require('./mailer');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 },
  })
);

// --- simple single-password auth (swap for real auth if you add multiple users) ---
function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  if (req.path === '/login' || req.path.startsWith('/public')) return next();
  return res.redirect('/login');
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  res.send(`
    <html><body style="font-family:system-ui;max-width:360px;margin:80px auto">
      <h2>regningoutbounn mail dashboard</h2>
      <form method="POST" action="/login">
        <input type="password" name="password" placeholder="Password" style="width:100%;padding:8px;margin-bottom:8px" autofocus />
        <button style="width:100%;padding:8px">Log in</button>
      </form>
    </body></html>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.password && req.body.password === process.env.DASHBOARD_PASSWORD) {
    req.session.authed = true;
    return res.redirect('/');
  }
  res.status(401).send('Wrong password. <a href="/login">Try again</a>');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.use(requireAuth);

app.use('/api/templates', require('./routes/templates'));
app.use('/api/send', require('./routes/send'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/connections', require('./routes/connections'));

app.get('/api/providers', (req, res) => {
  res.json(listProviders());
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Mail dashboard running on :${port}`));
