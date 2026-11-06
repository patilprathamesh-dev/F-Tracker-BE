// Wrap async route handlers so errors go to the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function apiKeyAuth(req, res, next) {
  const key = process.env.API_KEY;
  if (!key) return next();
  if (req.headers['x-api-key'] === key) return next();
  return res.status(401).json({ message: 'Invalid or missing API key' });
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
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
}

module.exports = { asyncHandler, apiKeyAuth, notFound, errorHandler };
