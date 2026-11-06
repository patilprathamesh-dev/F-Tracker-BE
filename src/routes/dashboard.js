const router = require('express').Router();
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Person = require('../models/Person');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { loanSummary } = require('../services/loanService');
const { monthKey } = require('../utils/dates');

/**
 * GET /api/dashboard
 * stats (given side):  totalPrincipal, expectedMonthly, receivedThisMonth, interestOutstanding
 * stats (taken side):  totalBorrowed, payableMonthly, paidThisMonth, interestDue
 * stats.netPosition = money given out − money borrowed (both outstanding principal)
 * thisMonth.items: every active loan due this month, each with its direction
 * chart: last 12 months of money received (given loans) and paid (taken loans)
 */
router.get('/', asyncHandler(async (req, res) => {
  const thisMonth = monthKey();
  const [persons, loans, unreadReminders] = await Promise.all([
    Person.countDocuments(),
    Loan.find({ status: 'active' }).populate('person', 'name phone'),
    Reminder.countDocuments({ read: false }),
  ]);

  const allPayments = await Payment.find({ loan: { $in: loans.map((l) => l._id) } }).lean();
  const byLoan = {};
  for (const p of allPayments) (byLoan[p.loan] ||= []).push(p);

  const given = { activeLoans: 0, totalPrincipal: 0, expectedMonthly: 0, receivedThisMonth: 0, interestOutstanding: 0 };
  const taken = { activeLoans: 0, totalBorrowed: 0, payableMonthly: 0, paidThisMonth: 0, interestDue: 0 };
  const thisMonthList = [];

  for (const loan of loans) {
    const direction = loan.direction || 'given';
    const s = await loanSummary(loan, byLoan[loan._id] || []);
    const current = s.months.find((m) => m.month === thisMonth);
    if (direction === 'taken') {
      taken.activeLoans += 1;
      taken.totalBorrowed += s.totals.principalOutstanding;
      taken.payableMonthly += s.totals.monthlyInterest;
      taken.interestDue += s.totals.interestOutstanding;
      taken.paidThisMonth += current?.paid || 0;
    } else {
      given.activeLoans += 1;
      given.totalPrincipal += s.totals.principalOutstanding;
      given.expectedMonthly += s.totals.monthlyInterest;
      given.interestOutstanding += s.totals.interestOutstanding;
      given.receivedThisMonth += current?.paid || 0;
    }
    if (current) {
      thisMonthList.push({
        loanId: loan._id,
        direction,
        title: loan.title,
        person: loan.person,
        dueDate: current.dueDate,
        expected: current.expected,
        paid: current.paid,
        status: current.status,
      });
    }
  }
  thisMonthList.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // Last 12 months: money received on given loans and paid on taken loans
  const since = new Date();
  since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);
  const takenIds = await Loan.distinct('_id', { direction: 'taken' });
  const monthly = await Payment.aggregate([
    { $match: { paidOn: { $gte: since } } },
    { $addFields: { isTaken: { $in: ['$loan', takenIds] } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m', date: '$paidOn', timezone: process.env.TIMEZONE || 'Asia/Kolkata' } },
      interest: { $sum: { $cond: [{ $and: [{ $not: ['$isTaken'] }, { $eq: ['$type', 'interest'] }] }, '$amount', 0] } },
      principal: { $sum: { $cond: [{ $and: [{ $not: ['$isTaken'] }, { $eq: ['$type', 'principal'] }] }, '$amount', 0] } },
      paid: { $sum: { $cond: ['$isTaken', '$amount', 0] } },
    } },
    { $sort: { _id: 1 } },
  ]);
  const chart = [];
  for (let i = 0; i < 12; i++) {
    const key = monthKey(new Date(since.getFullYear(), since.getMonth() + i, 1));
    const row = monthly.find((m) => m._id === key);
    chart.push({ month: key, interest: row?.interest || 0, principal: row?.principal || 0, paid: row?.paid || 0 });
  }

  res.json({
    stats: {
      persons,
      activeLoans: given.activeLoans,
      totalPrincipal: given.totalPrincipal,
      expectedMonthly: given.expectedMonthly,
      receivedThisMonth: given.receivedThisMonth,
      interestOutstanding: given.interestOutstanding,
      borrowedLoans: taken.activeLoans,
      totalBorrowed: taken.totalBorrowed,
      payableMonthly: taken.payableMonthly,
      paidThisMonth: taken.paidThisMonth,
      interestDue: taken.interestDue,
      netPosition: given.totalPrincipal - taken.totalBorrowed,
      unreadReminders,
    },
    thisMonth: { month: thisMonth, items: thisMonthList },
    chart,
  });
}));

module.exports = router;
