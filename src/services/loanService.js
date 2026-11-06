const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { monthKey, monthsSince, dueDateFor, startOfDay } = require('../utils/dates');

const round2 = (n) => Math.round(n * 100) / 100;
const sumBy = (list, fn) => list.reduce((s, p) => s + (fn(p) ? p.amount : 0), 0);

/** Interest is first due in the month AFTER the loan was given. */
function firstDueMonth(startDate) {
  const d = new Date(startDate);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/**
 * Principal still owed at the start of a month: original amount minus every
 * principal repayment made before the 1st of that month.
 */
function principalAtMonth(loan, payments, month) {
  const start = new Date(`${month}-01T00:00:00`);
  const repaid = sumBy(payments, (p) => p.type === 'principal' && new Date(p.paidOn) < start);
  return Math.max(loan.principal - repaid, 0);
}

/**
 * Interest expected for a month, on the principal still owed at the start of that month.
 * Example: ₹1,00,000 at 2%, ₹10,000 repaid in October -> November interest is 2% of ₹90,000 = ₹1,800.
 */
function expectedForMonth(loan, payments, month) {
  return round2((principalAtMonth(loan, payments, month) * loan.interestRate) / 100);
}

/**
 * Builds a month-by-month interest status for a loan.
 * Returns { months: [{ month, expected, principal, paid, balance, status, dueDate }], totals, thisMonth }
 * status: 'paid' | 'partial' | 'pending' (not yet due) | 'overdue'
 * Months after the principal was fully repaid have no interest and are left out.
 */
async function loanSummary(loan, payments) {
  if (!payments) payments = await Payment.find({ loan: loan._id }).lean();
  const today = startOfDay();

  const endKey = loan.status === 'closed' && loan.closedDate ? monthKey(loan.closedDate) : monthKey();
  const first = firstDueMonth(loan.startDate);
  const keys = first <= endKey ? monthsSince(new Date(`${first}-01T00:00:00`), endKey) : [];

  const paidByMonth = {};
  for (const p of payments) {
    if (p.type !== 'principal' && p.forMonth) paidByMonth[p.forMonth] = (paidByMonth[p.forMonth] || 0) + p.amount;
  }
  const interestReceived = sumBy(payments, (p) => p.type !== 'principal');
  const principalReceived = sumBy(payments, (p) => p.type === 'principal');
  const principalOutstanding = Math.max(loan.principal - principalReceived, 0);

  const months = [];
  for (const month of keys) {
    const principal = principalAtMonth(loan, payments, month);
    const expected = round2((principal * loan.interestRate) / 100);
    const paid = paidByMonth[month] || 0;
    if (expected <= 0 && !paid) continue; // fully repaid before this month
    const dueDate = dueDateFor(month, loan.dueDay);
    let status;
    if (paid >= expected) status = 'paid';
    else if (paid > 0) status = 'partial';
    else if (dueDate < today) status = 'overdue';
    else status = 'pending';
    months.push({ month, expected, principal, paid, balance: round2(Math.max(expected - paid, 0)), status, dueDate });
  }

  const interestOutstanding = round2(months.filter((m) => m.dueDate <= today).reduce((s, m) => s + m.balance, 0));
  const current = monthKey();

  return {
    months: months.reverse(), // newest first
    thisMonth: months.find((m) => m.month === current) || null,
    totals: {
      // Interest per month from now on, on what is still owed
      monthlyInterest: loan.status === 'active' ? round2((principalOutstanding * loan.interestRate) / 100) : 0,
      originalMonthlyInterest: round2((loan.principal * loan.interestRate) / 100),
      interestReceived,
      principalReceived,
      principalOutstanding,
      interestOutstanding,
      overdueMonths: months.filter((m) => m.status === 'overdue' || (m.status === 'partial' && m.dueDate < today)).length,
    },
  };
}

/**
 * Loans as JSON with the calculated figures added, for lists:
 * monthlyInterest (current, on the remaining principal), originalMonthlyInterest,
 * principalOutstanding, principalPaid, interestPaid, interestOutstanding and thisMonth ({ month, expected, paid, balance, status, dueDate } or null).
 */
async function withSummaries(loans) {
  const payments = await Payment.find({ loan: { $in: loans.map((l) => l._id) } }).lean();
  const byLoan = {};
  for (const p of payments) (byLoan[p.loan] ||= []).push(p);
  return Promise.all(loans.map(async (loan) => {
    const s = await loanSummary(loan, byLoan[loan._id] || []);
    const json = typeof loan.toJSON === 'function' ? loan.toJSON() : { ...loan };
    return {
      ...json,
      monthlyInterest: s.totals.monthlyInterest,
      originalMonthlyInterest: s.totals.originalMonthlyInterest,
      principalOutstanding: s.totals.principalOutstanding,
      principalPaid: s.totals.principalReceived,
      interestPaid: s.totals.interestReceived,
      interestOutstanding: s.totals.interestOutstanding,
      thisMonth: s.thisMonth,
    };
  }));
}

/**
 * Keeps the loan status in line with its principal repayments:
 * - principal fully repaid      -> close it ('repaid'), stop reminders
 * - repayment deleted / reduced -> reopen a loan that was closed automatically
 * Returns 'closed' | 'reopened' | null.
 */
async function syncLoanStatus(loanId) {
  const loan = await Loan.findById(loanId);
  if (!loan) return null;
  const principalPayments = await Payment.find({ loan: loan._id, type: 'principal' }).sort({ paidOn: 1 }).lean();
  const repaid = sumBy(principalPayments, () => true);

  if (loan.status === 'active' && repaid >= loan.principal && loan.principal > 0) {
    loan.status = 'closed';
    loan.closedDate = principalPayments[principalPayments.length - 1].paidOn;
    loan.closedReason = 'repaid';
    await loan.save();
    await Reminder.deleteMany({ loan: loan._id, read: false });
    return 'closed';
  }
  if (loan.status === 'closed' && loan.closedReason === 'repaid' && repaid < loan.principal) {
    loan.status = 'active';
    loan.closedDate = undefined;
    loan.closedReason = undefined;
    await loan.save();
    return 'reopened';
  }
  return null;
}

module.exports = { loanSummary, withSummaries, syncLoanStatus, firstDueMonth, expectedForMonth, principalAtMonth };
