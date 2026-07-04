/**
 * deploy-email.js
 *
 * Creates (or updates) the AEO Discovery confirmation email in HubSpot
 * Marketing Emails via the v3 API.
 *
 * Usage:
 *   node scripts/deploy-email.js
 *
 * Requires the token in .env to have the `content` scope.
 * To SEND automatically on form submission you'll also need:
 *   - `automation` scope  (to create/update a workflow)
 *   - `marketing-email`  scope  (to trigger sends via API)
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const BASE  = 'https://api.hubapi.com';
const AUTH  = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const EMAIL_NAME    = 'AEO Discovery — Registration Confirmation';
const SUBJECT       = "You're registered — AEO Discovery, 5 August";
const PREVIEW_TEXT  = "Your spot is confirmed. Here's everything you need to know before the day.";
const FROM_NAME     = 'Propeller Group';
const FROM_EMAIL    = 'info@propellergroup.com';  // must be a verified sending address in your portal

function log(msg)  { console.log(`\n✓ ${msg}`); }
function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

async function findExistingEmail() {
  const res  = await fetch(`${BASE}/marketing/v3/emails?limit=50`, { headers: AUTH });
  const data = await res.json();
  return (data.results || []).find(e => e.name === EMAIL_NAME) || null;
}

async function deployEmail() {
  console.log('\n📧  Deploying AEO Discovery confirmation email to HubSpot...');

  const htmlBody = fs.readFileSync(
    path.join(__dirname, '../emails/confirmation.html'),
    'utf8'
  );

  const existing = await findExistingEmail();

  const payload = {
    name:        EMAIL_NAME,
    subject:     SUBJECT,
    previewText: PREVIEW_TEXT,
    fromName:    FROM_NAME,
    replyTo:     FROM_EMAIL,
    content: {
      body: htmlBody,
    },
    sendOnPublish: false,
    emailType: 'BATCH_EMAIL',   // standard one-time / workflow email
  };

  let res, data;

  if (existing) {
    log(`Updating existing email (ID: ${existing.id})...`);
    res  = await fetch(`${BASE}/marketing/v3/emails/${existing.id}`, {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify(payload),
    });
  } else {
    log('Creating new email...');
    res  = await fetch(`${BASE}/marketing/v3/emails`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(payload),
    });
  }

  data = await res.json();

  if (!res.ok) {
    fail(`Email API error (${res.status}): ${data.message || JSON.stringify(data).slice(0, 400)}`);
  }

  log(`Email saved — ID: ${data.id}`);
  console.log('\n──────────────────────────────────────────────────────');
  console.log('✅  Done!');
  console.log(`    Email ID   : ${data.id}`);
  console.log(`    Name       : ${data.name}`);
  console.log(`    Subject    : ${SUBJECT}`);
  console.log(`    State      : ${data.currentState || 'DRAFT'}`);
  console.log('');
  console.log('    → HubSpot > Marketing > Emails > "AEO Discovery — Registration Confirmation"');
  console.log('');
  console.log('    Next: wire it to send automatically when someone submits');
  console.log('    the AEO Discovery registration form by creating a Workflow');
  console.log('    in HubSpot > Automation > Workflows (or let us do it via API');
  console.log('    once you add the `automation` + `marketing-email` scopes).');
  console.log('──────────────────────────────────────────────────────\n');
}

deployEmail().catch(err => { console.error(err); process.exit(1); });
