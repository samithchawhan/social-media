require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = require('./database');

const sourcePath = path.resolve(process.env.SQLITE_DB_PATH || process.env.DB_PATH || './data/app.db');
const markerId = 'sqlite-to-mongo-v1';
const collectionNames = ['users', 'posts', 'comments', 'likes', 'follows'];
const imageTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function sqliteDate(value) {
  const text = String(value);
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SQLite timestamp: ${text}`);
  return date;
}

function idsAsNumbers(rows, fields) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (key === 'id' || fields.includes(key)) return [key === 'id' ? '_id' : key, Number(value)];
    return [key, value];
  })));
}

async function replaceDocuments(name, documents) {
  if (!documents.length) return;
  await db.collection(name).bulkWrite(documents.map(document => ({
    replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true },
  })));
}

async function migrate() {
  if (!fs.existsSync(sourcePath)) {
    console.log(`No SQLite database found at ${sourcePath}; nothing to migrate.`);
    return;
  }

  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    const source = Object.fromEntries(collectionNames.map(name => [name, sqlite.prepare(`SELECT * FROM ${name}`).all()]));
    await db.connect();

    const migrations = db.collection('_migrations');
    if (await migrations.findOne({ _id: markerId })) {
      console.log('SQLite data has already been migrated.');
      return;
    }

    for (const name of collectionNames) {
      const unexpected = await db.collection(name).findOne({ _id: { $not: { $type: 'number' } } });
      if (unexpected) {
        throw new Error(`MongoDB collection "${name}" already contains data. Migration stopped without overwriting it.`);
      }
    }

    const users = idsAsNumbers(source.users, []);
    const posts = idsAsNumbers(source.posts, ['user_id']);
    const comments = idsAsNumbers(source.comments, ['post_id', 'user_id']);
    const likes = idsAsNumbers(source.likes, ['post_id', 'user_id']);
    const follows = idsAsNumbers(source.follows, ['follower_id', 'following_id']);

    for (const document of users) document.created_at = sqliteDate(document.created_at);
    for (const document of [...posts, ...comments, ...likes, ...follows]) document.created_at = sqliteDate(document.created_at);

    const postColumns = new Set(sqlite.prepare('PRAGMA table_info(posts)').all().map(column => column.name));
    if (postColumns.has('image_path')) {
      const uploadDir = process.env.UPLOAD_DIR || path.join(path.dirname(sourcePath), 'uploads');
      for (let index = 0; index < posts.length; index++) {
        const imagePath = source.posts[index].image_path;
        if (!imagePath) continue;
        const filename = path.basename(imagePath);
        const mimeType = imageTypes[path.extname(filename).toLowerCase()];
        const filePath = path.join(uploadDir, filename);
        if (!mimeType || !fs.existsSync(filePath)) {
          throw new Error(`Could not find a supported image file for SQLite post ${posts[index]._id}.`);
        }
        const image = fs.readFileSync(filePath);
        if (image.length > 15 * 1024 * 1024) {
          throw new Error(`The image for SQLite post ${posts[index]._id} exceeds MongoDB's 16 MB document limit.`);
        }
        posts[index].image_data = image;
        posts[index].image_mime = mimeType;
        delete posts[index].image_path;
      }
    }

    for (const name of collectionNames) {
      await replaceDocuments(name, { users, posts, comments, likes, follows }[name]);
    }
    await migrations.insertOne({ _id: markerId, completed_at: new Date(), source: sourcePath });
    console.log(`Migrated ${users.length} users, ${posts.length} posts, ${comments.length} comments, ${likes.length} likes, and ${follows.length} follows.`);
  } finally {
    sqlite.close();
  }
}

migrate().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());