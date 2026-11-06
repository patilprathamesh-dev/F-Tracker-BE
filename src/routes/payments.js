const router = require('express').Router();
const Payment = require('../models/Payment');
const Loan = require('../models/Loan');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { monthKey } = require('../utils/dates');

// GET /api/payments?from=2026-01-01&to=2026-12-31&person=<id>&loan=<id>
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.person) filter.person = req.query.person;
  if (req.query.loan) filter.loan = req.query.loan;
  if (req.query.from || req.query.to) {
    filter.paidOn = {};
    if (req.query.from) filter.paidOn.$gte = new Date(req.query.from);
    if (req.query.to) filter.paidOn.$lte = new Date(`${req.query.to}T23:59:59`);
  }
  const payments = await Payment.find(filter)
    .populate('person', 'name')
    .populate('loan', 'title principal interestRate')
    .sort({ paidOn: -1 })
    .limit(Number(req.query.limit) || 500);
  res.json(payments);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { loan: loanId, amount, type = 'interest', paidOn, forMonth, method, note } = req.body;
  const loan = await Loan.findById(loanId);
  if (!loan) return res.status(400).json({ message: 'Loan not found' });
  const date = paidOn ? new Date(paidOn) : new Date();
  const payment = await Payment.create({
    loan: loan._id,
    person: loan.person,
    amount,
    type,
    paidOn: date,
    forMonth: type === 'interest' ? forMonth || monthKey(date) : forMonth || undefined,
    method,
    note,
  });

  // If that month is now fully paid, mark its reminders as read
  if (payment.type === 'interest') {
    const agg = await Payment.aggregate([
      { $match: { loan: loan._id, forMonth: payment.forMonth, type: 'interest' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    if ((agg[0]?.total || 0) >= loan.monthlyInterest) {
      await Reminder.updateMany({ loan: loan._id, forMonth: payment.forMonth }, { read: true });
    }
  }
  res.status(201).json(payment);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const allowed = ['amount', 'type', 'paidOn', 'forMonth', 'method', 'note'];
  const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const payment = await Payment.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  res.json(payment);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndDelete(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  res.json({ message: 'Deleted' });
}));

module.exports = router;
