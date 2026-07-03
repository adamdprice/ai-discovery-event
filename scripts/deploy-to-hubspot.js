/**
 * deploy-to-hubspot.js
 *
 * Deploys the AEO Discovery landing page to HubSpot CMS:
 *  1. Creates a HubSpot marketing form for registrations
 *  2. Builds modified HTML that submits directly to HubSpot's forms endpoint
 *  3. Extracts CSS → headHtml, body HTML + scripts → footerHtml
 *  4. Creates and publishes a landing page using an existing portal template
 *     with a full CSS/HTML override so it renders as our custom design
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const TOKEN     = process.env.HUBSPOT_ACCESS_TOKEN;
const PORTAL_ID = 8285369;
const BASE      = 'https://api.hubapi.com';
const AUTH      = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// Sprocket Rocket LP template — minimal layout, present in this portal
const TEMPLATE_PATH = '@marketplace/Sprocket_Rocket/sr-theme-free/templates/SR Landing Page.html';

function log(msg)  { console.log(`\n✓ ${msg}`); }
function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

// ── 1. Create HubSpot form (or reuse existing) ───────────────────────────────
const FORM_NAME = 'AEO Discovery Registration — 5 August 2026';

async function findExistingForm() {
  const res = await fetch(`${BASE}/marketing/v3/forms?limit=50`, { headers: AUTH });
  const data = await res.json();
  return (data.results || []).find(f => f.name === FORM_NAME) || null;
}

async function createForm() {
  const existing = await findExistingForm();
  if (existing) {
    log(`Reusing existing form — GUID: ${existing.id}`);
    return existing.id;
  }

  log('Creating HubSpot registration form...');

  const fieldDef = (name, label, type, required) => ({
    objectTypeId: '0-1',
    name,
    label,
    required,
    fieldType: type,
    validation: {
      blockedEmailAddresses: [],
      useDefaultBlockList: type === 'email',
      minNumberOfCharacters: 0,
      maxNumberOfCharacters: 0,
    },
  });

  const res = await fetch(`${BASE}/marketing/v3/forms`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({
      name: 'AEO Discovery Registration — 5 August 2026',
      formType: 'hubspot',
      createdAt: new Date().toISOString(),
      configuration: {
        createNewContactForNewEmail: true,
        editable: true,
        allowLinkToResetKnownValues: false,
      },
      fieldGroups: [
        {
          groupType: 'default_group',
          richTextType: 'text',
          fields: [
            fieldDef('firstname', 'First Name',       'single_line_text', true),
            fieldDef('lastname',  'Last Name',        'single_line_text', true),
          ],
        },
        {
          groupType: 'default_group',
          richTextType: 'text',
          fields: [
            fieldDef('email',   'Work Email',        'email',            true),
            fieldDef('company', 'Agency / Company',  'single_line_text', true),
          ],
        },
        {
          groupType: 'default_group',
          richTextType: 'text',
          fields: [
            fieldDef('jobtitle', 'Your Role',                             'single_line_text', true),
            fieldDef('message',  'Biggest challenge with AI visibility?', 'multi_line_text',  false),
          ],
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) fail(`Form creation failed: ${data.message}\n${JSON.stringify(data, null, 2)}`);
  log(`Form created — GUID: ${data.id}`);
  return data.id;
}  // end createForm

// ── 2. Parse HTML into HubSpot-injectable parts ──────────────────────────────
function parseHtml(rawHtml, formGuid) {
  // Swap in HubSpot form submission endpoint
  let html = rawHtml.replace(
    /\/\* FORM \*\/[\s\S]*?^}/m,
    `/* FORM */
async function submitForm(e) {
  e.preventDefault();
  const btn = document.querySelector('.form-submit');
  btn.textContent = 'Submitting...';
  btn.disabled = true;

  const payload = {
    fields: [
      { name: 'firstname', value: document.getElementById('fname').value },
      { name: 'lastname',  value: document.getElementById('lname').value },
      { name: 'email',     value: document.getElementById('email').value },
      { name: 'company',   value: document.getElementById('agency').value },
      { name: 'jobtitle',  value: document.getElementById('role').value },
      { name: 'message',   value: document.getElementById('challenge').value },
    ],
    context: { pageUri: window.location.href, pageName: 'AEO Discovery Registration' },
  };

  try {
    const res = await fetch(
      'https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${formGuid}',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (res.ok) {
      document.getElementById('form-content').style.display = 'none';
      document.getElementById('form-success').style.display = 'block';
    } else {
      btn.textContent = 'Try again';
      btn.disabled = false;
      alert('Something went wrong — please email info@propellergroup.com');
    }
  } catch {
    btn.textContent = 'Try again';
    btn.disabled = false;
    alert('Something went wrong — please email info@propellergroup.com');
  }
}`
  );

  // ── Extract all <style> blocks ──
  const styleBlocks = [];
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    styleBlocks.push(css);
    return '';
  });

  // ── Extract <script> blocks ──
  const scriptBlocks = [];
  html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => {
    scriptBlocks.push(`<script>${js}</script>`);
    return '';
  });

  // ── Extract <body> content ──
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml  = bodyMatch ? bodyMatch[1].trim() : html;

  // headHtml — our CSS + a hard reset that hides the SR template elements
  const headHtml = `
<!-- AEO Discovery: Custom styles -->
<style>
/* ── TEMPLATE RESET — hide Sprocket Rocket's default LP structure ── */
.hs-page-width-normal > *:not(#aeo-root),
.body-container > *:not(#aeo-root),
.hs-header-wrapper,
.hs-footer-wrapper,
header.hs,
footer.hs,
nav.hs {
  display: none !important;
}
body { margin: 0; padding: 0; }

/* ── Prevent flash — reveal only once JS has injected content ── */
body { opacity: 0; transition: opacity .25s; }
</style>

<!-- AEO Discovery: Page styles -->
<style>
${styleBlocks.join('\n\n')}
</style>`;

  // footerHtml — our body content + scripts + reveal
  const footerHtml = `
<!-- AEO Discovery: Page content -->
<div id="aeo-root">
${bodyHtml}
</div>

<!-- AEO Discovery: Page scripts -->
${scriptBlocks.join('\n')}

<!-- HubSpot tracking -->
<script type="text/javascript" id="hs-script-loader" async defer
  src="//js.hs-scripts.com/${PORTAL_ID}.js"></script>

<script>
  // Reveal page once everything is injected
  document.addEventListener('DOMContentLoaded', function() {
    document.body.style.opacity = '1';
  });
</script>`;

  return { headHtml, footerHtml };
}

// ── 3. Find existing page by slug ────────────────────────────────────────────
async function findExistingPage(slug) {
  const res = await fetch(
    `${BASE}/cms/v3/pages/landing-pages?slug=${encodeURIComponent(slug)}&archived=false`,
    { headers: AUTH }
  );
  const data = await res.json();
  return (data.results || []).find(p => p.slug === slug) || null;
}

// ── 4. Create + publish the HubSpot landing page ─────────────────────────────
async function createPage(headHtml, footerHtml) {
  const existing = await findExistingPage('aeo-discovery');

  if (existing) {
    log(`Updating existing page (ID: ${existing.id})...`);
    const res = await fetch(`${BASE}/cms/v3/pages/landing-pages/${existing.id}`, {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({
        htmlTitle: 'AEO Discovery: A New Opportunity for Agencies | 5 August 2026',
        metaDescription:
          'Join Propeller Group for a practical workshop on AEO — Answer Engine Optimization. ' +
          'Learn how to make your agency visible where buyers are looking next. 5 August 2026.',
        headHtml,
        footerHtml,
      }),
    });
    const data = await res.json();
    if (!res.ok) fail(`Page update failed (${res.status}): ${data.message}`);
    log(`Page updated — ID: ${data.id}`);
    return data;
  }

  log('Creating landing page in HubSpot...');

  const res = await fetch(`${BASE}/cms/v3/pages/landing-pages`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({
      name: 'AEO Discovery: A New Opportunity for Agencies',
      slug: 'aeo-discovery',
      htmlTitle: 'AEO Discovery: A New Opportunity for Agencies | 5 August 2026',
      metaDescription:
        'Join Propeller Group for a practical workshop on AEO — Answer Engine Optimization. ' +
        'Learn how to make your agency visible where buyers are looking next. 5 August 2026.',
      templatePath: TEMPLATE_PATH,
      headHtml,
      footerHtml,
      state: 'DRAFT',
      publishImmediately: true,
    }),
  });

  const data = await res.json();
  if (!res.ok) fail(`Page creation failed (${res.status}): ${data.message}\n${JSON.stringify(data, null, 2)}`);
  log(`Page created — ID: ${data.id}`);
  return data;
}  // end createPage

async function publishPage(pageId) {
  log('Publishing page...');
  const res = await fetch(`${BASE}/cms/v3/pages/landing-pages/${pageId}`, {
    method: 'PATCH',
    headers: AUTH,
    body: JSON.stringify({ currentState: 'PUBLISHED', state: 'PUBLISHED' }),
  });
  const data = await res.json();
  if (res.ok) {
    log(`Page is live! State: ${data.currentState}`);
  } else {
    console.log(`  (PATCH ${res.status}: ${JSON.stringify(data).slice(0, 200)})`);
    log('Page saved as DRAFT — publish manually in HubSpot > Marketing > Landing Pages.');
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🚀  Deploying AEO Discovery to HubSpot...');
  console.log(`    Portal: ${PORTAL_ID}`);

  const rawHtml   = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const formGuid  = await createForm();
  const { headHtml, footerHtml } = parseHtml(rawHtml, formGuid);
  const page      = await createPage(headHtml, footerHtml);
  await publishPage(page.id);

  console.log('\n──────────────────────────────────────────────────');
  console.log('✅  Deploy complete!');
  console.log(`    Page ID   : ${page.id}`);
  console.log(`    Slug      : /aeo-discovery`);
  console.log(`    URL       : ${page.url || '(check HubSpot — domain may not be set)'}`);
  console.log(`    Form GUID : ${formGuid}`);
  console.log('    → HubSpot > Marketing > Landing Pages > AEO Discovery');
  console.log('──────────────────────────────────────────────────\n');
})();
