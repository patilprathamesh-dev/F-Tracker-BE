const Loan = require('../models/Loan');
const Reminder = require('../models/Reminder');
const Payment = require('../models/Payment');
const { syncLoanStatus } = require('../services/loanService');

/**
 * One-time data fixes, safe to run on every start (they only touch old records).
 * - Loans and reminders created before "Borrowed" existed have no direction: they are 'given'.
 * - Active loans whose principal is already fully repaid are closed (interest stops).
 */
async function migrate() {
  const loans = await Loan.updateMany({ direction: { $exists: false } }, { $set: { direction: 'given' } });
  const reminders = await Reminder.updateMany({ direction: { $exists: false } }, { $set: { direction: 'given' } });
  if (loans.modifiedCount || reminders.modifiedCount) {
    console.log(`[migrate] set direction='given' on ${loans.modifiedCount} loan(s) and ${reminders.modifiedCount} reminder(s)`);
  }
  const repaidIds = await Payment.distinct('loan', { type: 'principal' });
  const active = await Loan.find({ _id: { $in: repaidIds }, status: 'active' }, '_id').lean();
  let closed = 0;
  for (const l of active) if ((await syncLoanStatus(l._id)) === 'closed') closed += 1;
  if (closed) console.log(`[migrate] closed ${closed} fully repaid loan(s)`);
}

module.exports = migrate;
