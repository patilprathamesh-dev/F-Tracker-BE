const Payment = require('../models/Payment');
const { monthKey, monthsSince, dueDateFor, startOfDay } = require('../utils/dates');

/** Interest is first due in the month AFTER the loan was given. */
function firstDueMonth(startDate) {
  const d = new Date(startDate);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/**
 * Builds a month-by-month interest status for a loan.
 * Returns { months: [{ month, expected, paid, status, dueDate }], totals }
 * status: 'paid' | 'partial' | 'pending' (not yet due) | 'overdue'
 */
async function loanSummary(loan, payments) {
  if (!payments) payments = await Payment.find({ loan: loan._id }).lean();
  const expected = loan.monthlyInterest ?? Math.round(loan.principal * loan.interestRate) / 100;
  const today = startOfDay();

  const endKey = loan.status === 'closed' && loan.closedDate ? monthKey(loan.closedDate) : monthKey();
  const first = firstDueMonth(loan.startDate);
  const keys = first <= endKey ? monthsSince(new Date(`${first}-01T00:00:00`), endKey) : [];

  const paidByMonth = {};
  let interestReceived = 0;
  let principalReceived = 0;
  for (const p of payments) {
    if (p.type === 'principal') principalReceived += p.amount;
    else {
      interestReceived += p.amount;
      if (p.forMonth) paidByMonth[p.forMonth] = (paidByMonth[p.forMonth] || 0) + p.amount;
    }
  }

  const months = keys.map((month) => {
    const paid = paidByMonth[month] || 0;
    const dueDate = dueDateFor(month, loan.dueDay);
    let status;
    if (paid >= expected) status = 'paid';
    else if (paid > 0) status = 'partial';
    else if (dueDate < today) status = 'overdue';
    else status = 'pending';
    return { month, expected, paid, balance: Math.max(expected - paid, 0), status, dueDate };
  });

  const interestOutstanding = months
    .filter((m) => m.dueDate <= today)
    .reduce((s, m) => s + m.balance, 0);

  return {
    months: months.reverse(), // newest first
    totals: {
      monthlyInterest: expected,
      interestReceived,
      principalReceived,
      principalOutstanding: Math.max(loan.principal - principalReceived, 0),
      interestOutstanding,
      overdueMonths: months.filter((m) => m.status === 'overdue' || (m.status === 'partial' && m.dueDate < today)).length,
    },
  };
}

module.exports = { loanSummary, firstDueMonth };
