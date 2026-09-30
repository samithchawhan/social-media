const { idString } = require('./database');

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeUser(user) {
  if (!user) return null;
  const { _id, password_hash, email, ...fields } = user;
  return { ...fields, id: idString(_id), created_at: isoDate(user.created_at) };
}

function serializePost(post, author, stats = {}) {
  return {
    id: idString(post._id),
    user_id: idString(post.user_id),
    username: author?.username || '',
    display_name: author?.display_name || '',
    avatar_color: author?.avatar_color || '#3C6E58',
    content: post.content,
    created_at: isoDate(post.created_at),
    image_url: post.image_mime ? `/api/posts/${idString(post._id)}/image` : null,
    image_mime: post.image_mime || null,
    like_count: stats.like_count || 0,
    comment_count: stats.comment_count || 0,
    liked_by_me: Boolean(stats.liked_by_me),
  };
}

function serializeComment(comment, author) {
  return {
    id: idString(comment._id),
    post_id: idString(comment.post_id),
    user_id: idString(comment.user_id),
    content: comment.content,
    created_at: isoDate(comment.created_at),
    username: author?.username || '',
    display_name: author?.display_name || '',
    avatar_color: author?.avatar_color || '#3C6E58',
  };
}

module.exports = { isoDate, serializeUser, serializePost, serializeComment };