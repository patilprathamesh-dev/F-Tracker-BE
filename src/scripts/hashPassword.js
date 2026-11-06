// Prints a bcrypt hash to use as ADMIN_PASSWORD. Run: npm run hash-password -- "your password"
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: npm run hash-password -- "your password"   (at least 8 characters)');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
console.log(`ADMIN_PASSWORD='${hash}'`);
console.log('Keep the single quotes in .env: the hash contains $ signs.');
