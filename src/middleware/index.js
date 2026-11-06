const { userFromToken } = require('../services/authService');

// Wrap async route handlers so errors go to the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Every protected route needs "Authorization: Bearer <token>" from POST /api/auth/login
function requireAuth(req, res, next) {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  const user = scheme === 'Bearer' ? userFromToken(token) : null;
  if (!user) return res.status(401).json({ message: 'Please log in' });
  req.user = user;
  next();
}

function notFound(req, res) {
  res.status(404).json({ message: `Not found: ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: `Invalid ${err.path}` });
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
}

module.exports = { asyncHandler, requireAuth, notFound, errorHandler };
