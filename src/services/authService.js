const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Single static login from backend/.env:
 *   ADMIN_EMAIL     the login email
 *   ADMIN_PASSWORD  a bcrypt hash (recommended, create one with `npm run hash-password -- "your password"`)
 *                   or plain text (fine on your own laptop, not on a server)
 * POST /api/auth/login returns a JWT that the app sends as "Authorization: Bearer <token>".
 */
const TOKEN_DAYS = 30;
const isBcryptHash = (s) => /^\$2[aby]\$\d{2}\$/.test(s);

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32 || s.startsWith('replace-')) throw new Error('AUTH_SECRET must be set in backend/.env (at least 32 characters)');
  return s;
}

function adminCredentials() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || (!isBcryptHash(password) && password.length < 8) || password === 'choose-a-strong-password') {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (a bcrypt hash, or at least 8 characters) must be set in backend/.env');
  }
  return { email, password };
}

// Constant-time comparison of two strings of any length
const sameText = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest()
);

// Changes whenever the email or password in .env changes, so old tokens stop working
const credentialVersion = () => {
  const { email, password } = adminCredentials();
  return crypto.createHmac('sha256', secret()).update(`${email}\n${password}`).digest('base64url').slice(0, 16);
};

async function checkLogin(email, password) {
  const admin = adminCredentials();
  const emailOk = sameText(String(email || '').trim().toLowerCase(), admin.email);
  const passOk = isBcryptHash(admin.password)
    ? await bcrypt.compare(String(password || ''), admin.password)
    : sameText(String(password || ''), admin.password);
  return emailOk && passOk ? { email: admin.email } : null;
}

const createToken = (user) =>
  jwt.sign({ email: user.email, v: credentialVersion() }, secret(), { algorithm: 'HS256', expiresIn: `${TOKEN_DAYS}d` });

// Returns the user for a valid token, otherwise null
function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
    if (payload.v !== credentialVersion()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

module.exports = { TOKEN_DAYS, secret, adminCredentials, checkLogin, createToken, userFromToken, sameText };
