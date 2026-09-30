const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();

// DELETE /api/comments/:id -> owner only
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = db.parseId(req.params.id);
  const comments = db.collection('comments');
  const comment = id == null ? null : await comments.findOne({ _id: id });
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  if (comment.user_id.toString() !== db.parseId(req.user.id)?.toString()) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }

  await comments.deleteOne({ _id: id });
  res.status(204).end();
}));

module.exports = router;