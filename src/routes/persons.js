const router = require('express').Router();
const Person = require('../models/Person');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');

const pick = (b) => ({ name: b.name, phone: b.phone, email: b.email, address: b.address, notes: b.notes });

// GET /api/persons?search=raj  -> list with loan totals
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  const persons = await Person.find(filter).sort({ name: 1 }).lean();
  const ids = persons.map((p) => p._id);

  const loanStats = await Loan.aggregate([
    { $match: { person: { $in: ids }, status: 'active' } },
    { $group: {
      _id: '$person',
      activeLoans: { $sum: 1 },
      totalPrincipal: { $sum: '$principal' },
      monthlyInterest: { $sum: { $divide: [{ $multiply: ['$principal', '$interestRate'] }, 100] } },
    } },
  ]);
  const map = Object.fromEntries(loanStats.map((s) => [String(s._id), s]));

  res.json(persons.map((p) => ({
    ...p,
    activeLoans: map[p._id]?.activeLoans || 0,
    totalPrincipal: map[p._id]?.totalPrincipal || 0,
    monthlyInterest: map[p._id]?.monthlyInterest || 0,
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findById(req.params.id).lean();
  if (!person) return res.status(404).json({ message: 'Person not found' });
  const loans = await Loan.find({ person: person._id }).sort({ startDate: -1 });
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
