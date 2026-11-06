const { Schema, model } = require('mongoose');

/**
 * A Loan is one amount of money given to a person.
 * One person can have many loans (e.g. 1,00,000 in Jan and 50,000 in June).
 * Monthly interest = principal * interestRate / 100
 */
const loanSchema = new Schema(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    title: { type: String, trim: true }, // e.g. "Shop loan"
    principal: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, required: true, min: 0 }, // % per month
    startDate: { type: Date, required: true },
    dueDay: { type: Number, min: 1, max: 28, default: 5 }, // day of month payment is expected
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    closedDate: { type: Date },
    description: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

loanSchema.virtual('monthlyInterest').get(function () {
  return Math.round(((this.principal * this.interestRate) / 100) * 100) / 100;
});

module.exports = model('Loan', loanSchema);
