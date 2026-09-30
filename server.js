require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db/database');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- API routes ---------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Static frontend -----------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Error handling --------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

async function start() {
  await db.connect();
  app.listen(PORT, () => {
    console.log(`Mini social app running at http://localhost:${PORT}`);
  });
}

start().catch(error => {
  console.error('Could not connect to MongoDB. Check MONGODB_URI and ensure the server is running.', error);
  process.exitCode = 1;
});
