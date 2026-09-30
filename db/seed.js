require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

const demoUsers = [
  { username: 'astra', email: 'astra@example.com', password: 'password123', display_name: 'Astra Lin', bio: 'Photographing the sky, one cloud at a time.', avatar_color: '#3C6E58' },
  { username: 'nomad', email: 'nomad@example.com', password: 'password123', display_name: 'Theo Nomad', bio: 'Currently: a train somewhere in the north.', avatar_color: '#C4573F' },
  { username: 'sable', email: 'sable@example.com', password: 'password123', display_name: 'Sable Cruz', bio: 'Small kitchen, big opinions about soup.', avatar_color: '#7A5C9E' },
  { username: 'you', email: 'you@example.com', password: 'password123', display_name: 'You', bio: 'New here — say hi!', avatar_color: '#B08900' },
];

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function seed() {
  await db.connect();
  const users = db.collection('users');
  const demoNames = demoUsers.map(user => user.username);
  const existing = await users.findOne({ $or: [
    { username: { $in: demoNames } },
    { email: { $in: demoUsers.map(user => user.email) } },
  ] });
  if (existing) {
    console.log('Demo data already exists.');
    return;
  }

  const userDocuments = demoUsers.map(({ password, ...user }) => ({
    ...user,
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date(),
  }));
  const insertedUsers = await users.insertMany(userDocuments);
  const userIds = Object.fromEntries(demoUsers.map((user, index) => [user.username, insertedUsers.insertedIds[index]]));

  const postDocuments = [
    { username: 'astra', content: 'Golden hour over the ridgeline. Worth the 5am alarm.', created_at: daysAgo(3) },
    { username: 'nomad', content: 'Missed my connection and ended up in a town with exactly one bakery. No regrets.', created_at: daysAgo(2) },
    { username: 'sable', content: "Finally cracked the recipe for my grandmother's lentil soup. Writing it down before I forget again.", created_at: daysAgo(1) },
    { username: 'astra', content: 'Question for the group: best budget tripod for night sky photos?', created_at: new Date(Date.now() - 5 * 60 * 60 * 1000) },
  ].map(({ username, ...post }) => ({ ...post, user_id: userIds[username] }));
  const insertedPosts = await db.collection('posts').insertMany(postDocuments);
  const postIds = Object.values(insertedPosts.insertedIds);

  await db.collection('comments').insertMany([
    { post_id: postIds[0], user_id: userIds.nomad, content: 'This is unreal. Where is this?', created_at: daysAgo(2) },
    { post_id: postIds[0], user_id: userIds.sable, content: 'Okay I need to start waking up earlier.', created_at: daysAgo(2) },
    { post_id: postIds[2], user_id: userIds.astra, content: 'Sending this to my mother immediately.', created_at: new Date(Date.now() - 20 * 60 * 60 * 1000) },
    { post_id: postIds[3], user_id: userIds.sable, content: 'Nothing fancy, but the Manfrotto compact ones hold up fine.', created_at: new Date(Date.now() - 3 * 60 * 60 * 1000) },
  ]);

  const likePairs = [];
  for (const postId of postIds) {
    likePairs.push({ post_id: postId, user_id: userIds.nomad }, { post_id: postId, user_id: userIds.sable });
  }
  likePairs.push({ post_id: postIds[0], user_id: userIds.you });
  await db.collection('likes').insertMany(likePairs.map(pair => ({ ...pair, created_at: new Date() })));

  await db.collection('follows').insertMany([
    { follower_id: userIds.you, following_id: userIds.astra },
    { follower_id: userIds.you, following_id: userIds.nomad },
    { follower_id: userIds.nomad, following_id: userIds.astra },
    { follower_id: userIds.sable, following_id: userIds.astra },
    { follower_id: userIds.astra, following_id: userIds.sable },
  ].map(follow => ({ ...follow, created_at: new Date() })));

  console.log('Seeded MongoDB with demo users, posts, comments, likes, and follows.');
  demoUsers.forEach(user => console.log(`  - ${user.email}`));
}

seed().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());