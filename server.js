require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const db = new sqlite3.Database('./recovery.db', (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log('Connected to SQLite database (recovery.db).');
});

// Initialize Database Tables & Seed Data
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      job TEXT NOT NULL,
      salary REAL NOT NULL,
      family INTEGER NOT NULL,
      extraInfo TEXT NOT NULL,
      address TEXT NOT NULL,
      roleType TEXT NOT NULL,
      urgent INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default community records if empty
  db.get("SELECT COUNT(*) AS count FROM records", (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare(`
        INSERT INTO records (id, name, job, salary, family, extraInfo, address, roleType, urgent, verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run('REC-101', 'Mr. Tena Feyisa', 'Hotel Merchant', 1800, 3, 'Surplus Hotel Meals', 'Central Town', 'Donor', 0, 1);
      stmt.run('REC-102', 'Ms. Marsimoy Shawul', 'Retail Assistant', 450, 5, 'Family Food Aid Request', 'West District', 'Acceptor', 0, 1);
      stmt.run('REC-103', 'Mr. Dechasa Yadeta', 'Town Business Owner', 2200, 2, 'Direct Micro-Grants & Dry Goods', 'Central Town', 'Donor', 0, 1);
      stmt.finalize();
      console.log('Default community records seeded successfully.');
    }
  });
});

// Middleware: Verify JWT Admin Token
function authenticateAdminToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. Admin token required.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
}

// API Route: Login (Mr. Hachalu Admin)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'hachalu_admin' && password === 'AdminSecure2026!') {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: 'Invalid username or password.' });
});

// API Route: Public Registration with $1,000 Salary Gating Policy
app.post('/api/register', (req, res) => {
  const { name, job, salary, family, type, address } = req.body;

  if (!name || !job || salary === undefined || !family || !type || !address) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const numericSalary = parseFloat(salary);
  const numericFamily = parseInt(family, 10);

  // Policy Rule: Salary > $1000 = Donor, Salary <= $1000 = Acceptor
  const roleType = numericSalary > 1000 ? 'Donor' : 'Acceptor';
  const urgent = (roleType === 'Acceptor' && (numericSalary <= 150 || numericFamily >= 5)) ? 1 : 0;
  const id = 'REC-' + Math.floor(1000 + Math.random() * 9000);

  const stmt = db.prepare(`
    INSERT INTO records (id, name, job, salary, family, extraInfo, address, roleType, urgent, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  stmt.run(id, name, job, numericSalary, numericFamily, type, address, roleType, urgent, function(err) {
    if (err) return res.status(500).json({ error: 'Failed to record entry in database.' });
    res.json({ success: true, id, roleType, urgent });
  });
  stmt.finalize();
});

// API Route: Fetch Public Verified Listings
app.get('/api/public/listings', (req, res) => {
  db.all("SELECT id, name, extraInfo, address, roleType, urgent FROM records WHERE verified = 1 ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database read failure.' });
    res.json(rows);
  });
});

// API Route: Admin Dashboard - Get All Records
app.get('/api/admin/records', authenticateAdminToken, (req, res) => {
  db.all("SELECT * FROM records ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database read failure.' });
    res.json(rows);
  });
});

// API Route: Admin Dashboard - Toggle Verification Status
app.patch('/api/admin/verify/:id', authenticateAdminToken, (req, res) => {
  const { id } = req.params;
  db.get("SELECT verified FROM records WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Record not found.' });
    
    const newStatus = row.verified === 1 ? 0 : 1;
    db.run("UPDATE records SET verified = ? WHERE id = ?", [newStatus, id], (err) => {
      if (err) return res.status(500).json({ error: 'Update failed.' });
      res.json({ success: true, verified: newStatus });
    });
  });
});

// API Route: Admin Dashboard - Delete Record
app.delete('/api/admin/delete/:id', authenticateAdminToken, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM records WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ error: 'Delete failed.' });
    res.json({ success: true });
  });
});

// Serve Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server executing at http://localhost:${PORT}`);
});