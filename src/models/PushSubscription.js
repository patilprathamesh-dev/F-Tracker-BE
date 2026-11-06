const { Schema, model } = require('mongoose');

// A Web Push subscription from a device (the iPhone Home Screen app)
const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true }
);

module.exports = model('PushSubscription', pushSubscriptionSchema);
