const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { monthKey, monthLabel, dueDateFor, daysBetween, inr } = require('../utils/dates');
const { firstDueMonth, expectedForMonth, principalAtMonth } = require('./loanService');
const { sendToAll } = require('./pushService');

/**
 * given: "Payment reminder for November 2026: Rahul Sharma has to pay ₹2,000 interest (2% of ₹1,00,000). Due on 5 Nov 2026."
 * taken: "Payment reminder for November 2026: You have to pay ₹1,500 interest to Amit Joshi (1.5% of ₹1,00,000). Due on 10 Nov 2026."
 */
function buildMessage({ personName, loan, forMonth, kind, balance, dueDate, principal }) {
  const due = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const rate = `(${loan.interestRate}% of ${inr(principal ?? loan.principal)})`;
  const base = loan.direction === 'taken'
    ? `You have to pay ${inr(balance)} interest to ${personName} ${rate}`
    : `${personName} has to pay ${inr(balance)} interest ${rate}`;
  const label = monthLabel(forMonth);
  if (kind === 'upcoming') return `Payment reminder for ${label}: ${base}. Due on ${due}.`;
  if (kind === 'due') return `Payment reminder for ${label}: ${base}. Due TODAY (${due}).`;
  return `Overdue payment for ${label}: ${base}. It was due on ${due}.`;
}

/**
 * Checks every active loan and creates reminders that don't exist yet.
 * Safe to run many times a day: the unique index stops duplicates.
 * Returns the list of newly created reminders.
 */
async function generateReminders(now = new Date()) {
  const daysBefore = Number(process.env.REMINDER_DAYS_BEFORE || 3);
  const currentKey = monthKey(now);
  const loans = await Loan.find({ status: 'active' }).populate('person', 'name');
  const created = [];

  for (const loan of loans) {
    if (!loan.person) continue;
    const first = firstDueMonth(loan.startDate);
    if (first > currentKey) continue; // nothing due yet

    // Check this month and the previous month (catches anything missed)
    const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const keys = [prev, currentKey].filter((k) => k >= first);

    const payments = await Payment.find({ loan: loan._id }).lean();
    for (const forMonth of keys) {
      // Interest is on the principal still owed at the start of that month
      const principal = principalAtMonth(loan, payments, forMonth);
      const expected = expectedForMonth(loan, payments, forMonth);
      const paid = payments.filter((p) => p.type === 'interest' && p.forMonth === forMonth).reduce((s, p) => s + p.amount, 0);
      const balance = Math.round((expected - paid) * 100) / 100;
      if (balance <= 0) continue;

      const dueDate = dueDateFor(forMonth, loan.dueDay);
      const days = daysBetween(now, dueDate);
      let kind = null;
      if (days < 0) kind = 'overdue';
      else if (days === 0) kind = 'due';
      else if (days <= daysBefore) kind = 'upcoming';
      if (!kind) continue;

      const message = buildMessage({ personName: loan.person.name, loan, forMonth, kind, balance, dueDate, principal });
      const res = await Reminder.updateOne(
        { loan: loan._id, forMonth, kind },
        { $setOnInsert: { person: loan.person._id, direction: loan.direction || 'given', amount: balance, dueDate, message, read: false } },
        { upsert: true }
      );
      if (res.upsertedCount) created.push({ message, kind, forMonth, direction: loan.direction || 'given', id: res.upsertedId });
    }
  }

  if (created.length) await Promise.all([sendEmail(created), sendPush(created)]);
  return created;
}

async function sendEmail(reminders) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, REMINDER_EMAIL_TO } = process.env;
  if (!SMTP_HOST || !REMINDER_EMAIL_TO) return;
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: SMTP_USER || REMINDER_EMAIL_TO,
      to: REMINDER_EMAIL_TO,
      subject: `Finance Tracker: ${reminders.length} payment reminder(s)`,
      text: reminders.map((r) => `• ${r.message}`).join('\n'),
    });
  } catch (err) {
    console.error('Reminder email failed:', err.message);
  }
}

// One push notification per new reminder (Web Push to the iPhone Home Screen app)
async function sendPush(reminders) {
  try {
    for (const r of reminders) {
      await sendToAll({
        title: 'Payment reminder',
        body: r.message,
        url: '/reminders',
        tag: String(r.id || `${r.forMonth}-${r.kind}`),
      });
    }
  } catch (err) {
    console.error('Reminder push failed:', err.message);
  }
}

function startReminderJob() {
  const hour = Number(process.env.REMINDER_HOUR || 9);
  const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
  cron.schedule(`0 ${hour} * * *`, async () => {
    try {
      const created = await generateReminders();
      console.log(`[reminders] ${created.length} new reminder(s)`);
    } catch (err) {
      console.error('[reminders] job failed:', err);
    }
  }, { timezone });
  console.log(`Reminder job scheduled daily at ${hour}:00 (${timezone})`);
}

module.exports = { generateReminders, startReminderJob };
