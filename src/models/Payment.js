const { Schema, model } = require('mongoose');

/**
 * Money received from a person against a loan.
 * type: 'interest'  -> the monthly interest
 *       'principal' -> part/full repayment of the original amount
 * forMonth: "YYYY-MM" the month this payment covers (used for reminders)
 */
const paymentSchema = new Schema(
  {
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['interest', 'principal'], default: 'interest' },
    paidOn: { type: Date, required: true, default: Date.now },
    forMonth: { type: String, match: /^\d{4}-\d{2}$/, index: true },
    method: { type: String, enum: ['cash', 'upi', 'bank', 'cheque', 'other'], default: 'cash' },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = model('Payment', paymentSchema);
