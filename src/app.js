const express = require('express');
const cors = require('cors');
const { apiKeyAuth, notFound, errorHandler } = require('./middleware');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', apiKeyAuth);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/persons', require('./routes/persons'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reminders', require('./routes/reminders'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
