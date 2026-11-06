const router = require('express').Router();
const Person = require('../models/Person');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { withSummaries } = require('../services/loanService');

const pick = (b) => ({ name: b.name, phone: b.phone, email: b.email, address: b.address, notes: b.notes });

/**
 * This month's status for one side (given or taken) of a person, over their active loans:
 * { month, status: 'paid'|'partial'|'pending'|'overdue', expected, paid, balance, dueDate } or null when nothing is due this month.
 * Worst status wins: overdue > partial > pending > paid.
 */
function monthStatus(loans) {
  const due = loans.map((l) => l.thisMonth).filter(Boolean);
  if (!due.length) return null;
  const rank = { overdue: 3, partial: 2, pending: 1, paid: 0 };
  const worst = due.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
  const unpaid = due.filter((m) => m.status !== 'paid');
  return {
    month: due[0].month,
    status: worst.status,
    expected: due.reduce((s, m) => s + m.expected, 0),
    paid: due.reduce((s, m) => s + m.paid, 0),
    balance: due.reduce((s, m) => s + m.balance, 0),
    dueDate: unpaid.length ? unpaid.map((m) => m.dueDate).sort((a, b) => a - b)[0] : worst.dueDate,
  };
}

// GET /api/persons?search=raj&direction=given|taken
// Totals are split by side, on the principal still owed:
//   given: totalGiven, monthlyInterestToReceive, thisMonthGiven
//   taken: totalTaken, monthlyInterestToPay, thisMonthTaken
// With ?direction, only people who have at least one loan on that side are returned.
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  const direction = ['given', 'taken'].includes(req.query.direction) ? req.query.direction : null;
  if (direction) filter._id = { $in: await Loan.distinct('person', { direction }) };

  const persons = await Person.find(filter).sort({ name: 1 }).lean();
  const loans = await withSummaries(await Loan.find({ person: { $in: persons.map((p) => p._id) }, status: 'active' }).lean());
  const byPerson = {};
  for (const l of loans) (byPerson[l.person] ||= []).push(l);
  const sum = (list, k) => Math.round(list.reduce((s, l) => s + l[k], 0) * 100) / 100;

  res.json(persons.map((p) => {
    const mine = byPerson[p._id] || [];
    const g = mine.filter((l) => (l.direction || 'given') === 'given');
    const k = mine.filter((l) => l.direction === 'taken');
    return {
      ...p,
      activeLoans: mine.length,
      givenLoans: g.length,
      takenLoans: k.length,
      totalGiven: sum(g, 'principalOutstanding'),
      monthlyInterestToReceive: sum(g, 'monthlyInterest'),
      thisMonthGiven: monthStatus(g),
      totalTaken: sum(k, 'principalOutstanding'),
      monthlyInterestToPay: sum(k, 'monthlyInterest'),
      thisMonthTaken: monthStatus(k),
    };
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findById(req.params.id).lean();
  if (!person) return res.status(404).json({ message: 'Person not found' });
  const loans = await withSummaries(await Loan.find({ person: person._id }).sort({ startDate: -1 }));
  res.json({ ...person, loans });
}));

router.post('/', asyncHandler(async (req, res) => {
  const person = await Person.create(pick(req.body));
  res.status(201).json(person);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
  if (!person) return res.status(404).json({ message: 'Person not found' });
  res.json(person);
}));

// Deleting a person removes all their loans, payments and reminders
router.delete('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findByIdAndDelete(req.params.id);
  if (!person) return res.status(404).json({ message: 'Person not found' });
  await Promise.all([
    Loan.deleteMany({ person: person._id }),
    Payment.deleteMany({ person: person._id }),
    Reminder.deleteMany({ person: person._id }),
  ]);
  res.json({ message: 'Deleted' });
}));

module.exports = router;
