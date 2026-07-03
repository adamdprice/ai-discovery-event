require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

app.post('/api/register', async (req, res) => {
  const { fname, lname, email, agency, role, challenge } = req.body;

  if (!fname || !lname || !email || !agency || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
      },
      body: JSON.stringify({
        properties: {
          firstname: fname,
          lastname: lname,
          email: email,
          company: agency,
          jobtitle: role,
          message: challenge || '',
          hs_lead_status: 'NEW',
          lifecyclestage: 'lead',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // If contact already exists (409), update them instead
      if (response.status === 409 && data.message && data.message.includes('Contact already exists')) {
        const existingId = data.message.match(/ID: (\d+)/)?.[1];
        if (existingId) {
          await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            },
            body: JSON.stringify({
              properties: {
                firstname: fname,
                lastname: lname,
                company: agency,
                jobtitle: role,
                message: challenge || '',
              },
            }),
          });
          console.log(`Updated existing contact: ${email}`);
          return res.json({ success: true });
        }
      }
      console.error('HubSpot error:', data);
      return res.status(500).json({ error: 'Failed to create contact', detail: data.message });
    }

    console.log(`New contact created in HubSpot: ${fname} ${lname} <${email}> — ${agency}`);
    res.json({ success: true });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
