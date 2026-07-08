// ga4-report.js
// Pull traffic reports from the GA4 Data API — channel mix, daily trend,
// top pages, and a spike drill-down (landing pages / country / device).
//
// Setup (one time):
//   1. In Google Cloud, create a service account and a JSON key.
//   2. In GA4 → Admin → Property Access Management, add the service account
//      email as a Viewer on the Improv Oven property.
//   3. Find your numeric GA4 property ID: Admin → Property Settings (e.g. 123456789).
//   4. Provide credentials + property to this script via env (see below).
//
// Auth (pick one):
//   - GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/key.json   (local dev)
//   - GA4_SA_KEY_JSON='{"type":"service_account",...}'       (raw JSON)
//   - GA4_SA_KEY_BASE64=<base64 of the key JSON>             (best for CI secrets)
//   GA4_PROPERTY_ID=123456789  (required)
//
// Usage:
//   node scripts/ga4-report.js                         # last 28 days
//   node scripts/ga4-report.js --start 2026-06-13 --end 2026-06-16   # spike drill
//   npm run ga4                                         # last 28 days

const { BetaAnalyticsDataClient } = require('@google-analytics/data');
try { require('dotenv').config(); } catch (_) {}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start') args.start = argv[++i];
    else if (a === '--end') args.end = argv[++i];
    else if (a === '--days') args.days = parseInt(argv[++i], 10);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}

function getClient() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    console.error('❌ Missing GA4_PROPERTY_ID (numeric, from GA4 Admin → Property Settings).');
    process.exit(1);
  }
  let credentials;
  if (process.env.GA4_SA_KEY_BASE64) {
    credentials = JSON.parse(Buffer.from(process.env.GA4_SA_KEY_BASE64, 'base64').toString('utf8'));
  } else if (process.env.GA4_SA_KEY_JSON) {
    credentials = JSON.parse(process.env.GA4_SA_KEY_JSON);
  } else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('❌ No credentials. Set GOOGLE_APPLICATION_CREDENTIALS, GA4_SA_KEY_JSON, or GA4_SA_KEY_BASE64.');
    process.exit(1);
  }
  const client = new BetaAnalyticsDataClient(credentials ? { credentials } : {});
  return { client, property: `properties/${propertyId}` };
}

function pad(str, n) {
  str = String(str);
  return str.length >= n ? str.slice(0, n) : str + ' '.repeat(n - str.length);
}
function padL(str, n) {
  str = String(str);
  return str.length >= n ? str : ' '.repeat(n - str.length) + str;
}

function printTable(title, rows, columns) {
  console.log(`\n${title}`);
  console.log('─'.repeat(Math.min(80, columns.reduce((s, c) => s + c.width + 2, 0))));
  const header = columns.map((c) => (c.align === 'r' ? padL(c.label, c.width) : pad(c.label, c.width))).join('  ');
  console.log(header);
  for (const r of rows) {
    const line = columns.map((c) => {
      const v = c.get(r);
      return c.align === 'r' ? padL(v, c.width) : pad(v, c.width);
    }).join('  ');
    console.log(line);
  }
}

function num(v) {
  return Number(v || 0).toLocaleString('en-US');
}
function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}
function secs(v) {
  return `${Math.round(Number(v || 0))}s`;
}

async function run() {
  const args = parseArgs(process.argv);
  const days = Number.isFinite(args.days) ? args.days : 28;
  const startDate = args.start || isoDaysAgo(days);
  const endDate = args.end || 'today';
  const limit = Number.isFinite(args.limit) ? args.limit : 15;
  const dateRanges = [{ startDate, endDate }];

  const { client, property } = getClient();
  console.log(`\n📊 GA4 report — ${property}`);
  console.log(`   Range: ${startDate} → ${endDate}`);

  // 1) Channel mix with engagement quality.
  const [channels] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
      { name: 'activeUsers' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  printTable('CHANNEL MIX (quality matters more than volume)', channels.rows || [], [
    { label: 'Channel', width: 18, get: (r) => r.dimensionValues[0].value },
    { label: 'Sessions', width: 9, align: 'r', get: (r) => num(r.metricValues[0].value) },
    { label: 'Users', width: 8, align: 'r', get: (r) => num(r.metricValues[4].value) },
    { label: 'Engaged', width: 8, align: 'r', get: (r) => num(r.metricValues[1].value) },
    { label: 'Eng.Rate', width: 8, align: 'r', get: (r) => pct(r.metricValues[2].value) },
    { label: 'AvgDur', width: 7, align: 'r', get: (r) => secs(r.metricValues[3].value) },
  ]);

  // 2) Daily trend by channel (to spot spikes and which channel drove them).
  const [daily] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: 100000,
  });
  const byDate = new Map();
  for (const row of daily.rows || []) {
    const d = row.dimensionValues[0].value;
    const ch = row.dimensionValues[1].value;
    const s = Number(row.metricValues[0].value || 0);
    if (!byDate.has(d)) byDate.set(d, { total: 0, top: '', topN: 0 });
    const e = byDate.get(d);
    e.total += s;
    if (s > e.topN) { e.topN = s; e.top = ch; }
  }
  const dailyRows = [...byDate.entries()].map(([d, e]) => ({ d, ...e }));
  printTable('DAILY SESSIONS (peak = spike day; "Driver" = biggest channel)', dailyRows, [
    { label: 'Date', width: 10, get: (r) => `${r.d.slice(0,4)}-${r.d.slice(4,6)}-${r.d.slice(6,8)}` },
    { label: 'Sessions', width: 9, align: 'r', get: (r) => num(r.total) },
    { label: 'Bar', width: 24, get: (r) => '█'.repeat(Math.min(24, Math.round(r.total / Math.max(1, Math.max(...dailyRows.map(x=>x.total))) * 24))) },
    { label: 'Driver', width: 16, get: (r) => `${r.top} (${r.topN})` },
  ]);

  // 3) Top pages.
  const [pages] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'activeUsers' }, { name: 'userEngagementDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  });
  printTable(`TOP ${limit} PAGES`, pages.rows || [], [
    { label: 'Page', width: 42, get: (r) => r.dimensionValues[0].value },
    { label: 'Views', width: 8, align: 'r', get: (r) => num(r.metricValues[0].value) },
    { label: 'Sessions', width: 9, align: 'r', get: (r) => num(r.metricValues[1].value) },
  ]);

  // 4) Landing pages + geo + device — most useful for diagnosing a spike.
  const [landing] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  });
  printTable(`TOP ${limit} LANDING PAGES`, landing.rows || [], [
    { label: 'Landing page', width: 46, get: (r) => r.dimensionValues[0].value },
    { label: 'Sessions', width: 9, align: 'r', get: (r) => num(r.metricValues[0].value) },
    { label: 'Eng.Rate', width: 8, align: 'r', get: (r) => pct(r.metricValues[1].value) },
  ]);

  const [geo] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });
  printTable('TOP COUNTRIES', geo.rows || [], [
    { label: 'Country', width: 24, get: (r) => r.dimensionValues[0].value },
    { label: 'Sessions', width: 9, align: 'r', get: (r) => num(r.metricValues[0].value) },
    { label: 'Eng.Rate', width: 8, align: 'r', get: (r) => pct(r.metricValues[1].value) },
  ]);

  console.log('\n✅ Done. Tip: low engagement-rate Direct traffic (<5%) is usually bots/spam, not real readers.');
}

run().catch((err) => {
  console.error('\n❌ GA4 report failed:', err.message);
  if (/PERMISSION_DENIED/.test(err.message)) {
    console.error('   → Add the service account email as a Viewer in GA4 Admin → Property Access Management.');
  }
  process.exit(1);
});
