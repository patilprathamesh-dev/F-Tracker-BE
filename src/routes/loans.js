const router = require('express').Router();
const Loan = require('../models/Loan');
const Person = require('../models/Person');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { loanSummary, withSummaries, syncLoanStatus } = require('../services/loanService');

const pick = (b) => {
  const out = {};
  for (const k of ['person', 'direction', 'title', 'principal', 'interestRate', 'startDate', 'dueDay', 'status', 'closedDate', 'description']) {
    if (b[k] !== undefined && b[k] !== '') out[k] = b[k];
  }
  return out;
};

const DIRECTIONS = ['given', 'taken'];

// GET /api/loans?status=active&person=<id>&direction=given|taken
// Each loan also gets principalOutstanding, principalPaid, interestPaid, thisMonth, and monthlyInterest
// calculated on the principal still owed (money received for 'given', paid by me for 'taken')
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.person) filter.person = req.query.person;
  if (DIRECTIONS.includes(req.query.direction)) filter.direction = req.query.direction;
  const loans = await Loan.find(filter).populate('person', 'name phone').sort({ startDate: -1 });
  res.json(await withSummaries(loans));
}));

// GET /api/loans/:id -> loan + payments + month-by-month status
router.get('/:id', asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id).populate('person', 'name phone email');
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  const payments = await Payment.find({ loan: loan._id }).sort({ paidOn: -1 }).lean();
  const summary = await loanSummary(loan, payments);
  const json = { ...loan.toJSON(), monthlyInterest: summary.totals.monthlyInterest, principalOutstanding: summary.totals.principalOutstanding };
  res.json({ loan: json, payments, ...summary });
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = pick(req.body);
  if (data.direction && !DIRECTIONS.includes(data.direction)) return res.status(400).json({ message: 'direction must be given or taken' });
  if (!(await Person.exists({ _id: data.person }))) return res.status(400).json({ message: 'Person not found' });
  const loan = await Loan.create(data);
  res.status(201).json(loan);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const data = pick(req.body);
  delete data.person;
  delete data.direction; // a loan cannot switch sides; delete it and add a new one instead
  const update = { $set: data };
  if (data.status === 'closed') {
    if (!data.closedDate) data.closedDate = new Date();
    data.closedReason = 'manual';
  }
  if (data.status === 'active') update.$unset = { closedDate: 1, closedReason: 1 };
  let loan = await Loan.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  // A changed amount can make the loan fully repaid (or not any more)
  if (data.principal !== undefined) {
    await syncLoanStatus(loan._id);
    loan = await Loan.findById(loan._id);
  }
  if (loan.status === 'closed') await Reminder.deleteMany({ loan: loan._id, read: false });
  res.json(loan);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const loan = await Loan.findByIdAndDelete(req.params.id);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  await Promise.all([Payment.deleteMany({ loan: loan._id }), Reminder.deleteMany({ loan: loan._id })]);
  res.json({ message: 'Deleted' });
}));

module.exports = router;
