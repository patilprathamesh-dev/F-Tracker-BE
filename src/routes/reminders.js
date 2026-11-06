const router = require('express').Router();
const Reminder = require('../models/Reminder');
const { asyncHandler } = require('../middleware');
const { generateReminders } = require('../services/reminderService');

// GET /api/reminders?unread=true
router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.unread === 'true') filter.read = false;
  const reminders = await Reminder.find(filter)
    .populate('person', 'name phone')
    .populate('loan', 'title')
    .sort({ read: 1, dueDate: 1 })
    .limit(200);
  res.json(reminders);
}));

router.get('/count', asyncHandler(async (req, res) => {
  res.json({ unread: await Reminder.countDocuments({ read: false }) });
}));

// Run the reminder check now (the same job runs automatically every day)
router.post('/run', asyncHandler(async (req, res) => {
  const created = await generateReminders();
  res.json({ created: created.length, reminders: created });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const r = await Reminder.findByIdAndUpdate(req.params.id, { read: req.body.read ?? true }, { new: true });
  if (!r) return res.status(404).json({ message: 'Reminder not found' });
  res.json(r);
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await Reminder.updateMany({ read: false }, { read: true });
  res.json({ message: 'All marked as read' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await Reminder.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
}));

module.exports = router;
