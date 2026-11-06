const { Schema, model } = require('mongoose');

const personSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

personSchema.index({ name: 'text', phone: 'text' });

module.exports = model('Person', personSchema);
