const router = require('express').Router();
const PushSubscription = require('../models/PushSubscription');
const { asyncHandler } = require('../middleware');
const push = require('../services/pushService');

// GET /api/push/public-key -> the VAPID public key the app needs to subscribe
router.get('/public-key', (req, res) => {
  if (!push.isConfigured()) return res.status(503).json({ message: 'Push is not set up on the server (VAPID keys missing)' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
router.post('/subscribe', asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !/^https:\/\//.test(endpoint) || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ message: 'Invalid push subscription' });
  }
  await PushSubscription.updateOne(
    { endpoint },
    { $set: { keys: { p256dh: keys.p256dh, auth: keys.auth }, userAgent: req.headers['user-agent'] } },
    { upsert: true }
  );
  res.status(201).json({ message: 'Subscribed' });
}));

// POST /api/push/unsubscribe { endpoint }
router.post('/unsubscribe', asyncHandler(async (req, res) => {
  if (req.body?.endpoint) await PushSubscription.deleteOne({ endpoint: req.body.endpoint });
  res.json({ message: 'Unsubscribed' });
}));

// POST /api/push/test -> sends a test notification to every device
router.post('/test', asyncHandler(async (req, res) => {
  if (!push.isConfigured()) return res.status(503).json({ message: 'Push is not set up on the server (VAPID keys missing)' });
  const result = await push.sendToAll({ title: 'Finance Tracker', body: 'Test notification: reminders will appear like this.', url: '/reminders', tag: 'test' });
  if (!result.sent) return res.status(400).json({ message: 'No devices are subscribed yet. Tap "Enable notifications" first.', ...result });
  res.json({ message: `Sent to ${result.sent} device(s)`, ...result });
}));

module.exports = router;
