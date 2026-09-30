const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { serializeUser } = require('../db/serializers');
const { requireAuth, signToken } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body || {};
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Usernames must be 3-20 characters: letters, numbers, underscores only.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const user = {
    username,
    email,
    password_hash: await bcrypt.hash(password, 10),
    display_name: typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 60) : username,
    bio: '',
    avatar_color: '#3C6E58',
    created_at: new Date(),
  };

  try {
    const result = await db.collection('users').insertOne(user);
    user._id = result.insertedId;
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That username or email is already taken.' });
    throw error;
  }

  const token = signToken({ id: user._id.toString(), username: user.username });
  res.status(201).json({ token, user: serializeUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await db.collection('users').findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const token = signToken({ id: user._id.toString(), username: user.username });
  res.json({ token, user: serializeUser(user) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const id = db.parseId(req.user.id);
  const user = id == null ? null : await db.collection('users').findOne({ _id: id });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: serializeUser(user) });
}));

module.exports = router;