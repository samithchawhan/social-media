const { collection, idString, parseId } = require('./database');
const { serializePost } = require('./serializers');

async function countByPost(collectionName, postIds) {
  const counts = await collection(collectionName).aggregate([
    { $match: { post_id: { $in: postIds } } },
    { $group: { _id: '$post_id', count: { $sum: 1 } } },
  ]).toArray();
  return new Map(counts.map(item => [idString(item._id), item.count]));
}

async function buildPostViews(posts, viewerId) {
  if (!posts.length) return [];

  const postIds = posts.map(post => post._id);
  const userIds = [...new Map(posts.map(post => [idString(post.user_id), post.user_id])).values()];
  const currentUserId = parseId(viewerId);
  const [authors, likeCounts, commentCounts, myLikes] = await Promise.all([
    collection('users').find({ _id: { $in: userIds } }, { projection: { password_hash: 0 } }).toArray(),
    countByPost('likes', postIds),
    countByPost('comments', postIds),
    currentUserId == null
      ? Promise.resolve([])
      : collection('likes').find({ user_id: currentUserId, post_id: { $in: postIds } }, { projection: { post_id: 1 } }).toArray(),
  ]);

  const authorsById = new Map(authors.map(author => [idString(author._id), author]));
  const likedPostIds = new Set(myLikes.map(like => idString(like.post_id)));

  return posts.map(post => serializePost(post, authorsById.get(idString(post.user_id)), {
    like_count: likeCounts.get(idString(post._id)),
    comment_count: commentCounts.get(idString(post._id)),
    liked_by_me: likedPostIds.has(idString(post._id)),
  }));
}

module.exports = { buildPostViews };