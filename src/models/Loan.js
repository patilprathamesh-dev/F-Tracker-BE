const { Schema, model } = require('mongoose');

/**
 * A Loan is one amount of money between me and a person.
 * direction: 'given' -> I gave money to the person (they pay me interest)
 *            'taken' -> I borrowed money from the person (I pay them interest)
 * One person can have many loans, on either side.
 * Monthly interest = principal still owed * interestRate / 100
 */
const loanSchema = new Schema(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    direction: { type: String, enum: ['given', 'taken'], default: 'given', index: true },
    title: { type: String, trim: true }, // e.g. "Shop loan"
    principal: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, required: true, min: 0 }, // % per month
    startDate: { type: Date, required: true },
    dueDay: { type: Number, min: 1, max: 28, default: 5 }, // day of month payment is expected
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    closedDate: { type: Date },
    // 'repaid' = closed automatically when the principal was fully repaid, 'manual' = closed by hand
    closedReason: { type: String, enum: ['repaid', 'manual'] },
    description: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Interest on the ORIGINAL amount. The API replaces this with the current figure
// (on the principal still owed) using loanService.withSummaries / loanSummary.
loanSchema.virtual('monthlyInterest').get(function () {
  return Math.round(((this.principal * this.interestRate) / 100) * 100) / 100;
});

module.exports = model('Loan', loanSchema);
