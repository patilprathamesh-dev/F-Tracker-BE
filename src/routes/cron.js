const router = require('express').Router();
const { asyncHandler } = require('../middleware');
const { sameText } = require('../services/authService');
const { generateReminders } = require('../services/reminderService');

/**
 * GET /api/cron/run-reminders?secret=<CRON_SECRET>   (or header "x-cron-secret: <CRON_SECRET>")
 * For hosts that sleep when idle (free Render plan): call this once a day from cron-job.org.
 * Disabled when CRON_SECRET is not set.
 */
router.get('/run-reminders', asyncHandler(async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const given = req.headers['x-cron-secret'] || req.query.secret || '';
  if (!expected || expected.length < 16 || !sameText(given, expected)) return res.status(401).json({ message: 'Invalid cron secret' });
  const created = await generateReminders();
  res.json({ created: created.length });
}));

module.exports = router;
