const express = require('express');
const db = require('../db/database');
const { buildPostViews } = require('../db/post-views');
const { serializeUser } = require('../db/serializers');
const { requireAuth, attachUserIfPresent } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();

function getUserByUsername(username) {
  return db.collection('users').findOne({ username });
}

// GET /api/users/:username -> public profile
router.get('/:username', attachUserIfPresent, asyncHandler(async (req, res) => {
  const user = await getUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const currentId = req.user ? db.parseId(req.user.id) : null;
  const [posts, followers, following, followRecord] = await Promise.all([
    db.collection('posts').countDocuments({ user_id: user._id }),
    db.collection('follows').countDocuments({ following_id: user._id }),
    db.collection('follows').countDocuments({ follower_id: user._id }),
    currentId == null ? null : db.collection('follows').findOne({ follower_id: currentId, following_id: user._id }),
  ]);

  res.json({
    user: serializeUser(user),
    counts: { posts, followers, following },
    isFollowing: Boolean(followRecord),
    isSelf: currentId != null && currentId.toString() === user._id.toString(),
  });
}));

// PUT /api/users/me -> update own profile
router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const id = db.parseId(req.user.id);
  const users = db.collection('users');
  const current = id == null ? null : await users.findOne({ _id: id });
  if (!current) return res.status(404).json({ error: 'User not found.' });

  const { displayName, bio, avatarColor } = req.body || {};
  const next = {
    display_name: typeof displayName === 'string' ? displayName.trim().slice(0, 60) || current.display_name : current.display_name,
    bio: typeof bio === 'string' ? bio.slice(0, 280) : current.bio,
    avatar_color: typeof avatarColor === 'string' ? avatarColor : current.avatar_color,
  };

  await users.updateOne({ _id: id }, { $set: next });
  res.json({ user: serializeUser({ ...current, ...next }) });
}));

// GET /api/users/:username/posts
router.get('/:username/posts', attachUserIfPresent, asyncHandler(async (req, res) => {
  const user = await getUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const posts = await db.collection('posts').find({ user_id: user._id })
    .sort({ created_at: -1, _id: -1 })
    .toArray();
  res.json({ posts: await buildPostViews(posts, req.user?.id) });
}));

async function getUserList(req, res, kind) {
  const user = await getUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const field = kind === 'followers' ? 'following_id' : 'follower_id';
  const userField = kind === 'followers' ? 'follower_id' : 'following_id';
  const links = await db.collection('follows').find({ [field]: user._id })
    .sort({ created_at: -1 })
    .toArray();
  const linkedUsers = links.length
    ? await db.collection('users').find({ _id: { $in: links.map(link => link[userField]) } }).toArray()
    : [];
  const usersById = new Map(linkedUsers.map(item => [db.idString(item._id), item]));
  const rows = links.map(link => serializeUser(usersById.get(db.idString(link[userField])))).filter(Boolean);
  res.json({ [kind]: rows });
}

router.get('/:username/followers', asyncHandler((req, res) => getUserList(req, res, 'followers')));
router.get('/:username/following', asyncHandler((req, res) => getUserList(req, res, 'following')));

// POST /api/users/:username/follow -> toggles follow/unfollow
router.post('/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const target = await getUserByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const followerId = db.parseId(req.user.id);
  if (followerId == null) return res.status(401).json({ error: 'Invalid or expired session.' });
  if (followerId.toString() === target._id.toString()) {
    return res.status(400).json({ error: "You can't follow yourself." });
  }

  const follows = db.collection('follows');
  const existing = await follows.findOne({ follower_id: followerId, following_id: target._id });
  if (existing) {
    await follows.deleteOne({ _id: existing._id });
  } else {
    try {
      await follows.insertOne({ follower_id: followerId, following_id: target._id, created_at: new Date() });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  const [following, followers] = await Promise.all([
    follows.countDocuments({ follower_id: followerId }),
    follows.countDocuments({ following_id: target._id }),
  ]);
  res.json({ following: !existing, counts: { followers, following } });
}));

module.exports = router;