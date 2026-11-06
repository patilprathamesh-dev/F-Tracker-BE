require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { startReminderJob, generateReminders } = require('./services/reminderService');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/finance_tracker');
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
