const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ambo_recovery_secret_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ambo_food_recovery';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Database Schemas
const DonorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  householdSize: { type: Number, required: true },
  income: { type: Number, required: true },
  type: { type: String, required: true },
  details: { type: String },
  amountETB: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const RecipientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  householdSize: { type: Number, required: true },
  income: { type: Number, required: true },
  category: { type: String, required: true },
  location: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Donor = mongoose.model('Donor', DonorSchema);
const Recipient = mongoose.model('Recipient', RecipientSchema);

// Admin Auth Middleware
const verifyAdminToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Access denied.' });

  try {
    const verified = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
    req.admin = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// API Routes
app.post('/api/donors', async (req, res) => {
  try {
    const { name, householdSize, income, type, details, amountETB } = req.body;
    if (income <= 5000) return res.status(400).json({ error: 'Income must be > 5000 ETB for donors.' });
    const donor = new Donor({ name, householdSize, income, type, details, amountETB });
    await donor.save();
    res.status(201).json({ message: 'Donor registered successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Database save error.' });
  }
});

app.post('/api/recipients', async (req, res) => {
  try {
    const { name, householdSize, income, category, location } = req.body;
    if (income > 5000) return res.status(400).json({ error: 'Income must be <= 5000 ETB for recipients.' });
    const recipient = new Recipient({ name, householdSize, income, category, location });
    await recipient.save();
    res.status(201).json({ message: 'Recipient request logged.' });
  } catch (err) {
    res.status(500).json({ error: 'Database save error.' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USER = process.env.ADMIN_USER || 'hachalu';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'ambo2026';

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username: 'Mr. Hachalu' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: 'Invalid credentials.' });
});

app.get('/api/admin/dashboard', verifyAdminToken, async (req, res) => {
  try {
    const totalDonors = await Donor.countDocuments();
    const totalRecipients = await Recipient.countDocuments();
    const cashDonations = await Donor.aggregate([
      { $match: { type: 'Cash Contribution' } },
      { $group: { _id: null, total: { $sum: '$amountETB' } } }
    ]);
    const recentDonors = await Donor.find().sort({ createdAt: -1 }).limit(5);
    const recentRecipients = await Recipient.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      totalDonors,
      totalRecipients,
      totalCashETB: cashDonations[0] ? cashDonations[0].total : 0,
      recentDonors,
      recentRecipients
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard data.' });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));