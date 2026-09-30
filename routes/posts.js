const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { buildPostViews } = require('../db/post-views');
const { serializeComment } = require('../db/serializers');
const { requireAuth, attachUserIfPresent } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
  fileFilter(req, file, callback) {
    if (!imageTypes.has(file.mimetype)) return callback(new Error('Choose a JPEG, PNG, or WebP image.'));
    callback(null, true);
  },
});

function receiveImage(req, res, next) {
  upload.single('image')(req, res, error => {
    if (!error) return next();
    const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'Images must be 5 MB or smaller.' : error.message });
  });
}

function imageBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && typeof value.value === 'function') return value.value(true);
  return null;
}

// GET /api/posts?scope=following|all -> feed
router.get('/', attachUserIfPresent, asyncHandler(async (req, res) => {
  const scope = req.query.scope === 'following' ? 'following' : 'all';
  const currentId = req.user ? db.parseId(req.user.id) : null;
  let filter = {};

  if (scope === 'following' && currentId != null) {
    const follows = await db.collection('follows').find({ follower_id: currentId }, { projection: { following_id: 1 } }).toArray();
    filter = { user_id: { $in: [currentId, ...follows.map(follow => follow.following_id)] } };
  }

  const posts = await db.collection('posts').find(filter, { projection: { image_data: 0 } })
    .sort({ created_at: -1, _id: -1 })
    .limit(100)
    .toArray();
  res.json({ posts: await buildPostViews(posts, currentId) });
}));

// GET /api/posts/:id/image -> image bytes stored on the post document
router.get('/:id/image', asyncHandler(async (req, res) => {
  const id = db.parseId(req.params.id);
  const post = id == null ? null : await db.collection('posts').findOne(
    { _id: id },
    { projection: { image_data: 1, image_mime: 1 } },
  );
  const bytes = post ? imageBuffer(post.image_data) : null;
  if (!bytes || !imageTypes.has(post.image_mime)) return res.status(404).end();

  res.set({
    'Content-Type': post.image_mime,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(bytes);
}));

// GET /api/posts/:id -> single post
router.get('/:id', attachUserIfPresent, asyncHandler(async (req, res) => {
  const id = db.parseId(req.params.id);
  const post = id == null ? null : await db.collection('posts').findOne({ _id: id }, { projection: { image_data: 0 } });
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const [view] = await buildPostViews([post], req.user?.id);
  res.json({ post: view });
}));

// POST /api/posts -> create text, image, or mixed post
router.post('/', requireAuth, receiveImage, asyncHandler(async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content && !req.file) return res.status(400).json({ error: 'Add some text or choose an image.' });
  if (content.length > 2000) return res.status(400).json({ error: 'Posts are limited to 2000 characters.' });

  const post = {
    user_id: db.parseId(req.user.id),
    content,
    image_data: req.file?.buffer || null,
    image_mime: req.file?.mimetype || null,
    created_at: new Date(),
  };
  const result = await db.collection('posts').insertOne(post);
  post._id = result.insertedId;
  const [view] = await buildPostViews([post], req.user.id);
  res.status(201).json({ post: view });
}));

// DELETE /api/posts/:id -> owner only
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = db.parseId(req.params.id);
  const posts = db.collection('posts');
  const post = id == null ? null : await posts.findOne({ _id: id });
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id.toString() !== db.parseId(req.user.id)?.toString()) {
    return res.status(403).json({ error: 'You can only delete your own posts.' });
  }

  await posts.deleteOne({ _id: id });
  await Promise.all([
    db.collection('comments').deleteMany({ post_id: id }),
    db.collection('likes').deleteMany({ post_id: id }),
  ]);
  res.status(204).end();
}));

// POST /api/posts/:id/like -> toggle like
router.post('/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const postId = db.parseId(req.params.id);
  const userId = db.parseId(req.user.id);
  const post = postId == null ? null : await db.collection('posts').findOne({ _id: postId }, { projection: { _id: 1 } });
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const likes = db.collection('likes');
  const existing = await likes.findOne({ post_id: postId, user_id: userId });
  if (existing) {
    await likes.deleteOne({ _id: existing._id });
  } else {
    try {
      await likes.insertOne({ post_id: postId, user_id: userId, created_at: new Date() });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  res.json({ liked: !existing, like_count: await likes.countDocuments({ post_id: postId }) });
}));

// GET /api/posts/:id/comments
router.get('/:id/comments', asyncHandler(async (req, res) => {
  const postId = db.parseId(req.params.id);
  const post = postId == null ? null : await db.collection('posts').findOne({ _id: postId }, { projection: { _id: 1 } });
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const comments = await db.collection('comments').find({ post_id: postId }).sort({ created_at: 1, _id: 1 }).toArray();
  const userIds = [...new Map(comments.map(comment => [db.idString(comment.user_id), comment.user_id])).values()];
  const authors = userIds.length
    ? await db.collection('users').find({ _id: { $in: userIds } }, { projection: { password_hash: 0, email: 0 } }).toArray()
    : [];
  const authorsById = new Map(authors.map(author => [db.idString(author._id), author]));
  res.json({ comments: comments.map(comment => serializeComment(comment, authorsById.get(db.idString(comment.user_id)))) });
}));

// POST /api/posts/:id/comments
router.post('/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  const postId = db.parseId(req.params.id);
  const post = postId == null ? null : await db.collection('posts').findOne({ _id: postId }, { projection: { _id: 1 } });
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ error: 'A comment needs some content.' });
  if (content.length > 1000) return res.status(400).json({ error: 'Comments are limited to 1000 characters.' });

  const userId = db.parseId(req.user.id);
  const author = await db.collection('users').findOne({ _id: userId });
  if (!author) return res.status(401).json({ error: 'Invalid or expired session.' });
  const comment = { post_id: postId, user_id: userId, content, created_at: new Date() };
  const result = await db.collection('comments').insertOne(comment);
  comment._id = result.insertedId;
  res.status(201).json({ comment: serializeComment(comment, author) });
}));

module.exports = router;