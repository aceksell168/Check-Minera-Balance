const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'minerapay-secret-key-2026';
const DB_PATH = path.join(__dirname, 'data');
const USERS_FILE = path.join(DB_PATH, 'users.json');
const HISTORY_FILE = path.join(DB_PATH, 'history.json');

// Ensure data directory exists
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

// Initialize users.json if not exists
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [
    { id: 1, username: 'rendy', password: bcryptjs.hashSync('asd123', 10), role: 'admin', fullName: 'Rendy' },
    { id: 2, username: 'fendi', password: bcryptjs.hashSync('asd123', 10), role: 'admin', fullName: 'Fendi' },
    { id: 3, username: 'navin', password: bcryptjs.hashSync('asd123', 10), role: 'user', fullName: 'Navin' },
    { id: 4, username: 'ridwan', password: bcryptjs.hashSync('asd123', 10), role: 'user', fullName: 'Ridwan' },
    { id: 5, username: 'joni', password: bcryptjs.hashSync('asd123', 10), role: 'user', fullName: 'Joni' }
  ];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

// Initialize history.json if not exists
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
}

// Utility functions
function readUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
function writeUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function readHistory() { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
function writeHistory(history) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2)); }

// Middleware: verify JWT
function verifyToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

// Middleware: admin only
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
}

// ROUTES

// 1. Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username);
  
  if (!user || !bcryptjs.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, fullName: user.fullName }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName } });
});

// 2. Get current user
app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json(req.user);
});

// 3. Change password
app.post('/api/auth/change-password', verifyToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  
  if (!user || !bcryptjs.compareSync(oldPassword, user.password)) {
    return res.status(401).json({ message: 'Old password is incorrect' });
  }
  
  user.password = bcryptjs.hashSync(newPassword, 10);
  writeUsers(users);
  res.json({ message: 'Password changed successfully' });
});

// 4. Fetch balances & withdraws (existing logic) + log history
app.post('/api/balance/check', verifyToken, (req, res) => {
  const { endpoint, auth, pathActive, pathPending, reconcileStatus, difference } = req.body;
  const history = readHistory();
  
  const entry = {
    id: Date.now(),
    username: req.user.username,
    fullName: req.user.fullName,
    role: req.user.role,
    timestamp: new Date().toISOString(),
    reconcileStatus: reconcileStatus || 'PENDING',
    difference: difference || 0,
    endpoint: endpoint
  };
  
  history.push(entry);
  writeHistory(history);
  
  res.json({ message: 'Check recorded', entry });
});

// 5. Get history (admin sees all, user sees only their own)
app.get('/api/history', verifyToken, (req, res) => {
  const history = readHistory();
  let filtered = history;
  
  if (req.user.role === 'user') {
    filtered = history.filter(h => h.username === req.user.username);
  }
  
  // Sort by timestamp descending
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(filtered);
});

// 6. Get history for dashboard (pagination)
app.get('/api/history/page', verifyToken, (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const history = readHistory();
  let filtered = history;
  
  if (req.user.role === 'user') {
    filtered = history.filter(h => h.username === req.user.username);
  }
  
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const total = filtered.length;
  const start = (page - 1) * limit;
  const paginated = filtered.slice(start, start + parseInt(limit));
  
  res.json({ data: paginated, total, page, limit });
});

// 7. Admin: Get all users
app.get('/api/admin/users', verifyToken, adminOnly, (req, res) => {
  const users = readUsers();
  res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role, fullName: u.fullName })));
});

// 8. Admin: Reset user password
app.post('/api/admin/reset-password/:userId', verifyToken, adminOnly, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === parseInt(req.params.userId));
  
  if (!user) return res.status(404).json({ message: 'User not found' });
  
  user.password = bcryptjs.hashSync('asd123', 10);
  writeUsers(users);
  res.json({ message: 'Password reset to asd123' });
});

// 9. Admin: Clear history
app.delete('/api/admin/history', verifyToken, adminOnly, (req, res) => {
  writeHistory([]);
  res.json({ message: 'History cleared' });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`✓ Backend running on http://localhost:${PORT}`));
