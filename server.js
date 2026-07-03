const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Simple in-memory store for registrations (swap for a DB or webhook in production)
const registrations = [];

app.post('/api/register', (req, res) => {
  const { fname, lname, email, agency, role, challenge } = req.body;
  if (!fname || !lname || !email || !agency || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  registrations.push({ fname, lname, email, agency, role, challenge, timestamp: new Date().toISOString() });
  console.log(`New registration: ${fname} ${lname} <${email}> — ${agency}`);
  res.json({ success: true, message: 'Registration received' });
});

// Serve the landing page for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
