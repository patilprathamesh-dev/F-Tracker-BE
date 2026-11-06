const router = require('express').Router();
const Payment = require('../models/Payment');
const Loan = require('../models/Loan');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { monthKey } = require('../utils/dates');
const { expectedForMonth, syncLoanStatus } = require('../services/loanService');

// GET /api/payments?from=2026-01-01&to=2026-12-31&person=<id>&loan=<id>&direction=given|taken
// direction=given -> money I received, direction=taken -> money I paid. Each payment gets `direction`.
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.person) filter.person = req.query.person;
  if (req.query.loan) filter.loan = req.query.loan;
  if (['given', 'taken'].includes(req.query.direction)) {
    const loanIds = await Loan.distinct('_id', { direction: req.query.direction });
    filter.loan = req.query.loan
      ? { $in: loanIds.filter((id) => String(id) === String(req.query.loan)) }
      : { $in: loanIds };
  }
  if (req.query.from || req.query.to) {
    filter.paidOn = {};
    if (req.query.from) filter.paidOn.$gte = new Date(req.query.from);
    if (req.query.to) filter.paidOn.$lte = new Date(`${req.query.to}T23:59:59`);
  }
  const payments = await Payment.find(filter)
    .populate('person', 'name')
    .populate('loan', 'title principal interestRate direction')
    .sort({ paidOn: -1 })
    .limit(Math.min(Number(req.query.limit) || 500, 2000))
    .lean();
  res.json(payments.map((p) => ({ ...p, direction: p.loan?.direction || 'given' })));
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

  // If that month's interest is now fully paid, mark its reminders as read
  if (payment.type === 'interest') {
    const all = await Payment.find({ loan: loan._id }).lean();
    const paid = all.filter((p) => p.type === 'interest' && p.forMonth === payment.forMonth).reduce((s, p) => s + p.amount, 0);
    if (paid >= expectedForMonth(loan, all, payment.forMonth)) {
      await Reminder.updateMany({ loan: loan._id, forMonth: payment.forMonth }, { read: true });
    }
  }
  // Principal fully repaid -> the loan closes by itself and interest stops
  const loanStatus = payment.type === 'principal' ? await syncLoanStatus(loan._id) : null;
  res.status(201).json({ ...payment.toObject(), loanStatus });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const allowed = ['amount', 'type', 'paidOn', 'forMonth', 'method', 'note'];
  const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const payment = await Payment.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  const loanStatus = await syncLoanStatus(payment.loan);
  res.json({ ...payment.toObject(), loanStatus });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndDelete(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  // Deleting a principal repayment can reopen a loan that closed automatically
  const loanStatus = payment.type === 'principal' ? await syncLoanStatus(payment.loan) : null;
  res.json({ message: 'Deleted', loanStatus });
}));

module.exports = router;
