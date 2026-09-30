const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const databaseName = process.env.MONGODB_DB || 'mini_social_app';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
let database;

async function connect() {
  await client.connect();
  database = client.db(databaseName);

  await Promise.all([
    collection('users').createIndex({ username: 1 }, { unique: true }),
    collection('users').createIndex({ email: 1 }, { unique: true }),
    collection('posts').createIndex({ user_id: 1, created_at: -1 }),
    collection('comments').createIndex({ post_id: 1, created_at: 1 }),
    collection('likes').createIndex({ post_id: 1, user_id: 1 }, { unique: true }),
    collection('follows').createIndex({ follower_id: 1, following_id: 1 }, { unique: true }),
    collection('follows').createIndex({ following_id: 1, created_at: -1 }),
  ]);

  return database;
}

function collection(name) {
  if (!database) throw new Error('MongoDB has not connected yet.');
  return database.collection(name);
}

function parseId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string') return null;
  if (/^\d{1,20}$/.test(value) && value.length < 24) return Number(value);
  if (ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function idString(value) {
  return value == null ? null : value.toString();
}

async function close() {
  await client.close();
  database = undefined;
}

module.exports = { connect, collection, parseId, idString, close };