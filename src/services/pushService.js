const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let configured = null;

// Push is optional: it only works when the VAPID keys are set in .env (run `npm run vapid`)
function isConfigured() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (configured) webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return configured;
}

/**
 * Sends one notification to every saved device.
 * Subscriptions the push service says are gone (404 / 410) are deleted.
 * Returns { sent, removed, failed }.
 */
async function sendToAll({ title, body, url = '/reminders', tag }) {
  if (!isConfigured()) return { sent: 0, removed: 0, failed: 0, disabled: true };
  const subs = await PushSubscription.find().lean();
  const payload = JSON.stringify({ title, body, url, tag });
  let sent = 0;
  let failed = 0;
  const gone = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 24 * 3600 });
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) gone.push(s._id);
      else { failed += 1; console.error('[push] send failed:', err.statusCode || err.message); }
    }
  }));
  if (gone.length) await PushSubscription.deleteMany({ _id: { $in: gone } });
  return { sent, removed: gone.length, failed };
}

module.exports = { isConfigured, sendToAll };
