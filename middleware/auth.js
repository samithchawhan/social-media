const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function getTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token;
  return null;
}

// Blocks the request unless a valid token is present.
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload; // { id, username }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

// Attaches req.user if a valid token is present, but never blocks the request.
// Used on public routes (like viewing a profile) that behave slightly
// differently for a logged-in visitor (e.g. showing "isFollowing").
function attachUserIfPresent(req, res, next) {
  const token = getTokenFromHeader(req);
  if (token) {
    try {
      req.user = jwt.verify(token, SECRET);
    } catch {
      // Ignore invalid tokens on optional routes — treat as logged out.
    }
  }
  next();
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
}

module.exports = { requireAuth, attachUserIfPresent, signToken };
