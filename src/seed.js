// Adds sample data so you can see the app working. Run: npm run seed
// WARNING: deletes all existing people, loans, payments and reminders first.
require('dotenv').config();
const mongoose = require('mongoose');
const Person = require('./models/Person');
const Loan = require('./models/Loan');
const Payment = require('./models/Payment');
const Reminder = require('./models/Reminder');
const { monthKey } = require('./utils/dates');
const { generateReminders } = require('./services/reminderService');

const monthsAgo = (n, day = 1) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, day);
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/finance_tracker');
  await Promise.all([Person.deleteMany({}), Loan.deleteMany({}), Payment.deleteMany({}), Reminder.deleteMany({})]);

  const [rahul, sneha, amit, vikas] = await Person.create([
    { name: 'Rahul Sharma', phone: '9876543210', notes: 'Shop owner, pays by UPI' },
    { name: 'Sneha Patil', phone: '9123456780', notes: 'Friend from college' },
    { name: 'Amit Joshi', phone: '9988776655' },
    { name: 'Vikas Mehta', phone: '9822001122', notes: 'Relative, lent money for the car' },
  ]);

  const loans = await Loan.create([
    { person: rahul._id, title: 'Shop stock', principal: 100000, interestRate: 2, startDate: monthsAgo(5, 10), dueDay: 5, description: 'Given in cash for Diwali stock' },
    { person: sneha._id, title: 'Personal', principal: 50000, interestRate: 1.5, startDate: monthsAgo(3, 2), dueDay: 10 },
    { person: amit._id, title: 'Bike', principal: 75000, interestRate: 2, startDate: monthsAgo(4, 15), dueDay: 7 },
    // Borrowed: money I took and pay interest on (Amit is on both sides)
    { person: amit._id, direction: 'taken', title: 'Home repair', principal: 100000, interestRate: 1.5, startDate: monthsAgo(3, 20), dueDay: 10 },
    { person: vikas._id, direction: 'taken', title: 'Car', principal: 200000, interestRate: 1, startDate: monthsAgo(2, 5), dueDay: 15 },
  ]);

  // Rahul paid every month except the current one; Sneha paid all; Amit missed last month
  const payments = [];
  for (let i = 4; i >= 1; i--) payments.push({ loan: loans[0]._id, person: rahul._id, amount: 2000, paidOn: monthsAgo(i, 5), forMonth: monthKey(monthsAgo(i)), method: 'upi' });
  for (let i = 2; i >= 0; i--) payments.push({ loan: loans[1]._id, person: sneha._id, amount: 750, paidOn: monthsAgo(i, 3), forMonth: monthKey(monthsAgo(i)), method: 'cash' });
  for (let i = 3; i >= 2; i--) payments.push({ loan: loans[2]._id, person: amit._id, amount: 1500, paidOn: monthsAgo(i, 7), forMonth: monthKey(monthsAgo(i)), method: 'bank' });
  payments.push({ loan: loans[0]._id, person: rahul._id, amount: 10000, type: 'principal', paidOn: monthsAgo(1, 20), method: 'bank', note: 'Part repayment' });
  // What I paid on the borrowed loans
  for (let i = 2; i >= 1; i--) payments.push({ loan: loans[3]._id, person: amit._id, amount: 1500, paidOn: monthsAgo(i, 9), forMonth: monthKey(monthsAgo(i)), method: 'upi' });
  payments.push({ loan: loans[4]._id, person: vikas._id, amount: 2000, paidOn: monthsAgo(1, 14), forMonth: monthKey(monthsAgo(1)), method: 'bank' });
  payments.push({ loan: loans[4]._id, person: vikas._id, amount: 20000, type: 'principal', paidOn: monthsAgo(1, 25), method: 'bank', note: 'Returned part of it' });
  await Payment.create(payments);

  const created = await generateReminders();
  console.log(`Seeded 4 persons, ${loans.length} loans (2 borrowed), ${payments.length} payments, ${created.length} reminders`);
  await mongoose.disconnect();
})();
