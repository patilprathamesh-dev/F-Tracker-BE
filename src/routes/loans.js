const router = require('express').Router();
const Loan = require('../models/Loan');
const Person = require('../models/Person');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { loanSummary } = require('../services/loanService');

const pick = (b) => {
  const out = {};
  for (const k of ['person', 'title', 'principal', 'interestRate', 'startDate', 'dueDay', 'status', 'closedDate', 'description']) {
    if (b[k] !== undefined && b[k] !== '') out[k] = b[k];
  }
  return out;
};

// GET /api/loans?status=active&person=<id>
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.person) filter.person = req.query.person;
  const loans = await Loan.find(filter).populate('person', 'name phone').sort({ startDate: -1 });
  res.json(loans);
}));

// GET /api/loans/:id -> loan + payments + month-by-month status
router.get('/:id', asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id).populate('person', 'name phone email');
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  const payments = await Payment.find({ loan: loan._id }).sort({ paidOn: -1 }).lean();
  const summary = await loanSummary(loan, payments);
  res.json({ loan, payments, ...summary });
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = pick(req.body);
  if (!(await Person.exists({ _id: data.person }))) return res.status(400).json({ message: 'Person not found' });
  const loan = await Loan.create(data);
  res.status(201).json(loan);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const data = pick(req.body);
  delete data.person;
  if (data.status === 'closed' && !data.closedDate) data.closedDate = new Date();
  if (data.status === 'active') data.closedDate = null;
  const loan = await Loan.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
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
