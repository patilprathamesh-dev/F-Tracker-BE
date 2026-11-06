const router = require('express').Router();
const auth = require('../services/authService');
const { asyncHandler, requireAuth } = require('../middleware');

// Simple in-memory limit: 5 failed logins per IP per 15 minutes
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map();
const tooManyFails = (ip) => {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) { fails.delete(ip); return false; }
  return f.count >= MAX_FAILS;
};
const recordFail = (ip) => {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) fails.set(ip, { count: 1, until: Date.now() + WINDOW_MS });
  else f.count += 1;
};

// POST /api/auth/login { email, password } -> { token, user }
router.post('/login', asyncHandler(async (req, res) => {
  const ip = req.ip;
  if (tooManyFails(ip)) return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
  const user = await auth.checkLogin(req.body?.email, req.body?.password);
  if (!user) {
    recordFail(ip);
    return res.status(401).json({ message: 'Incorrect email or password' });
  }
  fails.delete(ip);
  res.json({ token: auth.createToken(user), user });
}));

router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = router;
