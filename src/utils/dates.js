const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function dueDateFor(key, dueDay) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, dueDay);
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

/** All month keys from the loan start month up to (and including) the given month. */
function monthsSince(startDate, uptoKey = monthKey()) {
  const out = [];
  const d = new Date(startDate);
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  const [uy, um] = uptoKey.split('-').map(Number);
  while (y < uy || (y === uy && m <= um)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

module.exports = { monthKey, monthLabel, dueDateFor, startOfDay, daysBetween, monthsSince, inr };
