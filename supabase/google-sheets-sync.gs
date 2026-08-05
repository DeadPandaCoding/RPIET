/**
 * PropertyLedger → Google Sheets nightly backup sync
 * ==================================================
 *
 * Runs in Google Apps Script (attached to your backup spreadsheet) and
 * copies all five tables from your Supabase project into sheet tabs every
 * night, so you always have a readable, Excel-friendly copy of your data
 * in your own Google Drive.
 *
 * SETUP (full guide in supabase/google-sheets-sync.md):
 *   1. Create a blank Google Sheet named e.g. "PropertyLedger Backup".
 *   2. In that sheet: Extensions → Apps Script → paste this whole file.
 *   3. Fill in SUPABASE_URL, ANON_KEY and SERVICE_KEY below.
 *   4. Run setupTabs(), then "▶ Sync now" from the menu to test.
 *   5. Run installNightlyTrigger() once (from the menu or the toolbar).
 *
 * SECURITY:
 *   - SERVICE_KEY is the Supabase service_role key. It can read EVERYTHING
 *     in your project, so keep it only in this private script — never in
 *     the app repo, never shared. Your script belongs to your Google
 *     account, so only you (and Google) can see it.
 */

// ── CONFIGURATION ───────────────────────────────────────────────────────────
// Found in Supabase Dashboard → Project Settings → API.
// Paste ONLY the base Project URL, e.g. https://abc123.supabase.co
// (no trailing slash, no /rest/v1 — the script normalizes it anyway, but
// the plain base URL is correct).
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const ANON_KEY = 'your-anon-key';
const SERVICE_KEY = 'your-service-role-key'; // Settings → API → service_role

// The five tables, and the sheet tab each one lands in.
const TABLES = [
  { table: 'properties', tab: 'Properties' },
  { table: 'units',      tab: 'Units' },
  { table: 'tenants',    tab: 'Tenants' },
  { table: 'incomes',    tab: 'Incomes' },
  { table: 'expenses',   tab: 'Expenses' },
];

const CONFIG_TAB = 'Sync Log';

// ── Menu (appears in the spreadsheet when you reload it) ────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PropertyLedger Sync')
    .addItem('▶ Sync now', 'syncAll')
    .addItem('⚙ Install nightly trigger', 'installNightlyTrigger')
    .addItem('🔧 Create tabs', 'setupTabs')
    .addToUi();
}

// ── Setup helpers ───────────────────────────────────────────────────────────
function setupTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const t of TABLES) {
    if (!ss.getSheetByName(t.tab)) ss.insertSheet(t.tab);
  }
  if (!ss.getSheetByName(CONFIG_TAB)) ss.insertSheet(CONFIG_TAB);
  logToConfig_('Tabs ready. Use the menu → ▶ Sync now to pull your data.');
}

function installNightlyTrigger() {
  const existing = ScriptApp.getProjectTriggers();
  for (const tr of existing) {
    if (tr.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(tr);
  }
  ScriptApp.newTrigger('syncAll').timeBased().everyDays(1).atHour(3).create();
  logToConfig_('Nightly trigger installed: runs every day around 3:00 AM.');
  try {
    SpreadsheetApp.getUi().alert('Nightly sync installed — runs daily around 3:00 AM.');
  } catch (e) {}
}

// ── Main sync ───────────────────────────────────────────────────────────────
function syncAll() {
  const missing = [];
  if (!SUPABASE_URL || SUPABASE_URL.indexOf('YOUR-PROJECT') >= 0) missing.push('SUPABASE_URL');
  if (!ANON_KEY || ANON_KEY.indexOf('your-anon') >= 0) missing.push('ANON_KEY');
  if (!SERVICE_KEY || SERVICE_KEY.indexOf('your-service') >= 0) missing.push('SERVICE_KEY');
  if (missing.length) {
    const msg = 'Configuration incomplete: ' + missing.join(', ') + '. Fill them in at the top of the script.';
    logToConfig_(msg);
    Logger.log(msg);
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupTabs();
  const results = [];
  for (const { table, tab } of TABLES) {
    try {
      const rows = fetchTable_(table);
      writeTable_(ss.getSheetByName(tab), rows);
      results.push(tab + ': ' + rows.length + ' rows');
    } catch (err) {
      results.push(tab + ': ERROR → ' + err.message);
    }
  }
  writeLog_(ss, results);
  Logger.log(results.join('\n'));
}

// ── Data fetching (Supabase REST API, service role) ─────────────────────────
function fetchTable_(table) {
  const url = apiUrl_(table);
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: ANON_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      Accept: 'application/json',
    },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code >= 400) {
    throw new Error('HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText());
}

/**
 * Builds a correct Supabase REST URL no matter how SUPABASE_URL was pasted.
 * Handles: trailing slashes, whitespace, and a URL that already ends in
 * /rest/v1 (e.g. copied from the dashboard's REST API box). Without this,
 * those variations produce the PGRST125 'Invalid path' error.
 */
function apiUrl_(table) {
  var base = String(SUPABASE_URL).trim();
  base = base.replace(/\/rest\/v1\/?$/, ''); // strip accidental /rest/v1 suffix
  base = base.replace(/\/+$/, '');            // strip trailing slashes
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  return base + '/rest/v1/' + table + '?select=*&order=created_at.asc';
}

// ── Sheet writing ───────────────────────────────────────────────────────────
function writeTable_(sheet, rows) {
  sheet.clear();
  if (!rows || !rows.length) {
    sheet.setFrozenRows(1);
    return;
  }
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).sort();
  const values = [
    headers,
    ...rows.map((r) => headers.map((h) => formatCell_(r[h]))),
  ];
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
}

function formatCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function writeLog_(ss, results) {
  const sheet = ss.getSheetByName(CONFIG_TAB);
  if (!sheet) return;
  sheet.clear();
  const values = [
    ['Last synced', new Date().toLocaleString()],
    ['Status', results.filter((r) => r.indexOf('ERROR') < 0).length === TABLES.length ? 'All tables OK' : 'Some tables failed'],
    ['Details', results.join('  |  ')],
  ];
  sheet.getRange(1, 1, values.length, 2).setValues(values);
}

function logToConfig_(msg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_TAB) || ss.insertSheet(CONFIG_TAB);
  sheet.getRange('A1').setValue(msg);
}
