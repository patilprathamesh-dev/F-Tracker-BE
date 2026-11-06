const express = require('express');
const cors = require('cors');
const { requireAuth, notFound, errorHandler } = require('./middleware');

const app = express();

// Behind Render / Railway the client IP comes from X-Forwarded-For (used by the login rate limit)
app.set('trust proxy', 1);

// CLIENT_URL can list several origins separated by commas
const origins = (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins }));
app.use(express.json());

// Public routes
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cron', require('./routes/cron')); // protected by CRON_SECRET instead of a login

// Everything else needs a login token
app.use('/api', requireAuth);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/persons', require('./routes/persons'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/push', require('./routes/push'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
