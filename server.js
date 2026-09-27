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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas & Models
const DonorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  householdSize: { type: Number, required: true, min: 1 },
  income: { type: Number, required: true },
  type: { type: String, enum: ['Food Surplus', 'Cash Contribution'], required: true },
  details: { type: String, trim: true },
  amountETB: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now }
});

const RecipientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  householdSize: { type: Number, required: true, min: 1 },
  income: { type: Number, required: true },
  category: { type: String, required: true },
  location: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

const Donor = mongoose.model('Donor', DonorSchema);
const Recipient = mongoose.model('Recipient', RecipientSchema);

// Admin Authentication Middleware
const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. Authorization token required.' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.admin = verified;
    next();
  } catch (err) {
    return res.status(400).json({ error: 'Invalid or expired authentication token.' });
  }
};

// API ROUTES

// 1. Submit Donor Form
app.post('/api/donors', async (req, res) => {
  try {
    const { name, householdSize, income, type, details, amountETB } = req.body;

    if (!name || !householdSize || income === undefined || !type) {
      return res.status(400).json({ error: 'Missing required donor registration fields.' });
    }

    if (Number(income) <= 5000) {
      return res.status(400).json({ error: 'Donor income must be > 5000 ETB.' });
    }

    const donor = new Donor({
      name,
      householdSize: Number(householdSize),
      income: Number(income),
      type,
      details,
      amountETB: type === 'Cash Contribution' ? Number(amountETB || 0) : 0
    });

    await donor.save();
    return res.status(201).json({ message: 'Donor registered in database successfully.', donor });
  } catch (err) {
    console.error('Donor Error:', err);
    return res.status(500).json({ error: 'Error processing donor registration.' });
  }
});

// 2. Submit Recipient Request Form
app.post('/api/recipients', async (req, res) => {
  try {
    const { name, householdSize, income, category, location } = req.body;

    if (!name || !householdSize || income === undefined || !category || !location) {
      return res.status(400).json({ error: 'Missing required recipient registration fields.' });
    }

    if (Number(income) > 5000) {
      return res.status(400).json({ error: 'Recipient income must be <= 5000 ETB.' });
    }

    const recipient = new Recipient({
      name,
      householdSize: Number(householdSize),
      income: Number(income),
      category,
      location
    });

    await recipient.save();
    return res.status(201).json({ message: 'Recipient request saved in database successfully.', recipient });
  } catch (err) {
    console.error('Recipient Error:', err);
    return res.status(500).json({ error: 'Error processing recipient request.' });
  }
});

// 3. Public Aggregate Metrics (For index.html)
app.get('/api/public/stats', async (req, res) => {
  try {
    const totalDonors = await Donor.countDocuments();
    const totalRecipients = await Recipient.countDocuments();

    const cashTotal = await Donor.aggregate([
      { $match: { type: 'Cash Contribution' } },
      { $group: { _id: null, total: { $sum: '$amountETB' } } }
    ]);

    return res.json({
      totalDonors,
      totalRecipients,
      totalCashETB: cashTotal.length > 0 ? cashTotal[0].total : 0
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch public stats.' });
  }
});

// 4. Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USER = process.env.ADMIN_USER || 'hachalu';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'ambo2026';

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign(
      { username: 'Mr. Hachalu', role: 'System Administrator' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    return res.json({ success: true, token, admin: 'Mr. Hachalu' });
  }

  return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
});

// 5. Protected Admin Dashboard Endpoint with Yearly Breakdown & Analytics
app.get('/api/admin/dashboard', verifyAdminToken, async (req, res) => {
  try {
    const { year } = req.query;
    
    // Build date filter if year is provided (e.g., ?year=2026)
    let dateFilter = {};
    if (year) {
      const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
      const endDate = new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`);
      dateFilter = { createdAt: { $gte: startDate,$lt: endDate } };
    }

    const totalDonors = await Donor.countDocuments(dateFilter);
    const totalRecipients = await Recipient.countDocuments(dateFilter);

    const cashTotal = await Donor.aggregate([
      { $match: { ...dateFilter, type: 'Cash Contribution' } },
      { $group: { _id: null, total: { $sum: '$amountETB' } } }
    ]);

    const recentDonors = await Donor.find(dateFilter).sort({ createdAt: -1 }).limit(5);
    const recentRecipients = await Recipient.find(dateFilter).sort({ createdAt: -1 }).limit(5);

    // Get available years for historical dropdown selection in admin.html
    const donorYears = await Donor.aggregate([
      { $project: { year: { $year: "$createdAt" } } },
      { $group: { _id: "$year" } },
      { $sort: { _id: -1 } }
    ]);

    return res.json({
      filterYear: year || 'All Time',
      totalDonors,
      totalRecipients,
      totalCashETB: cashTotal.length > 0 ? cashTotal[0].total : 0,
      recentDonors,
      recentRecipients,
      availableYears: donorYears.map(y => y._id)
    });
  } catch (err) {
    console.error('Dashboard Error:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard metrics.' });
  }
});

// Page Routing
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// SPA Route Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => console.log(`Ambo Food Recovery Server active on port ${PORT}`));