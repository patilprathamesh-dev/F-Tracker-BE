require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const migrate = require('./config/migrate');
const { startReminderJob, generateReminders } = require('./services/reminderService');
const { secret, adminCredentials } = require('./services/authService');

const PORT = process.env.PORT || 5001;

(async () => {
  try {
    // Refuse to start without the login settings
    secret();
    adminCredentials();
    await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/finance_tracker');
    await migrate();
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
    startReminderJob();
    // Also check once at startup so nothing is missed if the server was off
    const created = await generateReminders();
    if (created.length) console.log(`[reminders] ${created.length} new reminder(s) at startup`);
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
})();
