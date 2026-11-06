const router = require('express').Router();
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Person = require('../models/Person');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { loanSummary } = require('../services/loanService');
const { monthKey } = require('../utils/dates');

// GET /api/dashboard -> totals, this month's status, last 12 months chart data
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

  let totalPrincipal = 0;
  let expectedMonthly = 0;
  let interestOutstanding = 0;
  const thisMonthList = [];

  for (const loan of loans) {
    const s = await loanSummary(loan, byLoan[loan._id] || []);
    totalPrincipal += s.totals.principalOutstanding;
    expectedMonthly += s.totals.monthlyInterest;
    interestOutstanding += s.totals.interestOutstanding;
    const current = s.months.find((m) => m.month === thisMonth);
    if (current) {
      thisMonthList.push({
        loanId: loan._id,
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

  // Last 12 months of money received
  const since = new Date();
  since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);
  const monthly = await Payment.aggregate([
    { $match: { paidOn: { $gte: since } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m', date: '$paidOn', timezone: process.env.TIMEZONE || 'Asia/Kolkata' } },
      interest: { $sum: { $cond: [{ $eq: ['$type', 'interest'] }, '$amount', 0] } },
      principal: { $sum: { $cond: [{ $eq: ['$type', 'principal'] }, '$amount', 0] } },
    } },
    { $sort: { _id: 1 } },
  ]);
  const chart = [];
  for (let i = 0; i < 12; i++) {
    const key = monthKey(new Date(since.getFullYear(), since.getMonth() + i, 1));
    const row = monthly.find((m) => m._id === key);
    chart.push({ month: key, interest: row?.interest || 0, principal: row?.principal || 0 });
  }

  const receivedThisMonth = thisMonthList.reduce((s, r) => s + r.paid, 0);

  res.json({
    stats: {
      persons,
      activeLoans: loans.length,
      totalPrincipal,
      expectedMonthly,
      receivedThisMonth,
      interestOutstanding,
      unreadReminders,
    },
    thisMonth: { month: thisMonth, items: thisMonthList },
    chart,
  });
}));

module.exports = router;
