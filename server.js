const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ========== KONEKSI MONGODB ==========
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected!'))
.catch(err => console.log('❌ MongoDB Error:', err.message));

// ========== SCHEMA & MODEL ==========
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    fullName: { type: String }
});

const HistorySchema = new mongoose.Schema({
    username: String,
    fullName: String,
    role: String,
    timestamp: { type: Date, default: Date.now },
    reconcileStatus: String,
    difference: Number,
    endpoint: String
});

const User = mongoose.model('User', UserSchema);
const History = mongoose.model('History', HistorySchema);

const JWT_SECRET = process.env.JWT_SECRET || 'minerapay-secret-key-2026';

// ========== MIDDLEWARE ==========
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

function adminOnly(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    next();
}

// ========== ROUTES ==========

// Root
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'MineraPay Backend is running on Render!',
        endpoints: {
            health: '/api/health',
            login: '/api/auth/login',
            changePassword: '/api/auth/change-password'
        }
    });
});

// Health
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server running on Render!' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user || !bcryptjs.compareSync(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({
            id: user._id,
            username: user.username,
            role: user.role,
            fullName: user.fullName
        }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                fullName: user.fullName
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current user
app.get('/api/auth/me', verifyToken, (req, res) => {
    res.json(req.user);
});

// Change password
app.post('/api/auth/change-password', verifyToken, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user || !bcryptjs.compareSync(oldPassword, user.password)) {
            return res.status(401).json({ message: 'Old password is incorrect' });
        }
        
        user.password = bcryptjs.hashSync(newPassword, 10);
        await user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check balance
app.post('/api/balance/check', verifyToken, async (req, res) => {
    try {
        const { endpoint, auth, pathActive, pathPending, reconcileStatus, difference } = req.body;
        
        const entry = new History({
            username: req.user.username,
            fullName: req.user.fullName,
            role: req.user.role,
            reconcileStatus: reconcileStatus || 'PENDING',
            difference: difference || 0,
            endpoint: endpoint
        });
        
        await entry.save();
        res.json({ message: 'Check recorded', entry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get history
app.get('/api/history', verifyToken, async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'user') {
            filter = { username: req.user.username };
        }
        const history = await History.find(filter).sort({ timestamp: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get history with pagination
app.get('/api/history/page', verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        let filter = {};
        if (req.user.role === 'user') {
            filter = { username: req.user.username };
        }
        
        const total = await History.countDocuments(filter);
        const data = await History.find(filter)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        res.json({ data, total, page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get all users
app.get('/api/admin/users', verifyToken, adminOnly, async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Reset password
app.post('/api/admin/reset-password/:userId', verifyToken, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        user.password = bcryptjs.hashSync('asd123', 10);
        await user.save();
        res.json({ message: 'Password reset to asd123' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Clear history
app.delete('/api/admin/history', verifyToken, adminOnly, async (req, res) => {
    try {
        await History.deleteMany({});
        res.json({ message: 'History cleared' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/setup', async (req, res) => {
    try {
        const { username, password, fullName } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.json({ message: 'User sudah ada' });
        const hashed = bcryptjs.hashSync(password, 10);
        const user = new User({ username, password: hashed, role: 'admin', fullName });
        await user.save();
        res.json({ message: 'User created!', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
