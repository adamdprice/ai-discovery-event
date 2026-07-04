/**
 * deploy-email.js
 *
 * Deploys the AEO Discovery confirmation email to HubSpot:
 *  1. Uploads emails/confirmation.html as a CODED template via Design Manager API
 *  2. Creates (or updates) the marketing email, pointing it at that template
 *
 * Re-run safe: detects existing template and email by name and updates in place.
 *
 * Required token scope: `content`
 * To wire automatic sending after form submission:
 *   add `automation` + `marketing-email` scopes, then run deploy-workflow.js
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const BASE  = 'https://api.hubapi.com';
const AUTH  = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const TEMPLATE_PATH = 'custom/email/aeo-confirmation.html';
const EMAIL_NAME    = 'AEO Discovery — Registration Confirmation';
const SUBJECT       = "You're registered — AEO Discovery, 5 August";
const PREVIEW_TEXT  = 'Your spot is confirmed. Here\'s everything you need to know before the day.';
const FROM_NAME     = 'Propeller Group';
const REPLY_TO      = 'info@propellergroup.com';

function log(msg)  { console.log(`\n✓ ${msg}`); }
function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

// ── 1. Upload / update the coded email template ──────────────────────────────
async function upsertTemplate(html) {
  // Check if a template at this path already exists
  const listRes  = await fetch(`${BASE}/designmanager/v1/templates?limit=100`, { headers: AUTH });
  const listData = await listRes.json();
  const existing = (listData.objects || []).find(t => t.path === TEMPLATE_PATH);

  if (existing) {
    log(`Updating existing email template (ID: ${existing.id})...`);
    const res = await fetch(`${BASE}/designmanager/v1/templates/${existing.id}`, {
      method: 'PUT',
      headers: AUTH,
      body: JSON.stringify({ source: html }),
    });
    const data = await res.json();
    if (!res.ok) fail(`Template update failed (${res.status}): ${data.message}`);
    log(`Template updated — path: ${TEMPLATE_PATH}`);
    return existing.id;
  }

  log('Uploading email template to Design Manager...');
  const res = await fetch(`${BASE}/designmanager/v1/templates`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({
      path: TEMPLATE_PATH,
      source: html,
      is_available_for_new_content: true,
      template_type: 2,   // 2 = email
    }),
  });
  const data = await res.json();

  // 409 means it already exists — extract the ID and do an update
  if (res.status === 409) {
    const match = data.message && data.message.match(/id (\d+)/);
    const existingId = match ? match[1] : null;
    if (!existingId) fail(`Template conflict but could not extract ID: ${data.message}`);
    log(`Template already exists (ID: ${existingId}) — updating...`);
    const upRes  = await fetch(`${BASE}/designmanager/v1/templates/${existingId}`, {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ source: html }),
    });
    const upData = await upRes.json();
    if (!upRes.ok) fail(`Template update failed (${upRes.status}): ${upData.message}`);
    log(`Template updated — path: ${TEMPLATE_PATH}`);
    return existingId;
  }

  if (!res.ok) fail(`Template creation failed (${res.status}): ${data.message}`);
  log(`Template created (ID: ${data.id}) — path: ${TEMPLATE_PATH}`);
  return data.id;
}

// ── 2. Create / update the marketing email ───────────────────────────────────
async function upsertEmail() {
  const listRes  = await fetch(`${BASE}/marketing/v3/emails?limit=50`, { headers: AUTH });
  const listData = await listRes.json();
  const existing = (listData.results || []).find(e => e.name === EMAIL_NAME);

  const payload = {
    name:        EMAIL_NAME,
    subject:     SUBJECT,
    previewKey:  PREVIEW_TEXT,
    from:        { fromName: FROM_NAME, replyTo: REPLY_TO },
    content:     { templatePath: TEMPLATE_PATH },
    emailTemplateMode: 'DESIGN_MANAGER',
    sendOnPublish: false,
  };

  let res, data;

  if (existing) {
    log(`Updating existing email (ID: ${existing.id})...`);
    res  = await fetch(`${BASE}/marketing/v3/emails/${existing.id}`, {
      method: 'PATCH', headers: AUTH, body: JSON.stringify(payload),
    });
  } else {
    log('Creating new email...');
    res  = await fetch(`${BASE}/marketing/v3/emails`, {
      method: 'POST', headers: AUTH, body: JSON.stringify(payload),
    });
  }

  data = await res.json();
  if (!res.ok) fail(`Email API error (${res.status}): ${data.message || JSON.stringify(data).slice(0, 400)}`);

  log(`Email saved (ID: ${data.id}) — mode: ${data.emailTemplateMode}`);
  return data;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n📧  Deploying AEO Discovery confirmation email...');

  const html = fs.readFileSync(path.join(__dirname, '../emails/confirmation.html'), 'utf8');

  await upsertTemplate(html);
  const email = await upsertEmail();

  console.log('\n──────────────────────────────────────────────────────');
  console.log('✅  Done!');
  console.log(`    Email ID   : ${email.id}`);
  console.log(`    Subject    : ${SUBJECT}`);
  console.log(`    Template   : ${TEMPLATE_PATH}`);
  console.log(`    State      : ${email.state || 'DRAFT'}`);
  console.log('');
  console.log('    → HubSpot > Marketing > Emails > "AEO Discovery — Registration Confirmation"');
  console.log('');
  console.log('    To auto-send on registration: HubSpot > Automation > Workflows');
  console.log('    Trigger: "Form submitted = AEO Discovery Registration"');
  console.log('    Action:  "Send email = AEO Discovery — Registration Confirmation"');
  console.log('──────────────────────────────────────────────────────\n');
})().catch(err => { console.error(err); process.exit(1); });
