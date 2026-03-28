// scripts/send-daily-digest.js
// Sends a daily email with yesterday's 4 new recipes via MailerLite API
// Runs every morning at 9am EST via GitHub Actions

const https = require('https');
const fs = require('fs');
const path = require('path');

const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const SITE_URL = 'https://www.improvoven.com';
const GROUP_ID = '2222920'; // ImprovOven group

function mailerliteRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'connect.mailerlite.com',
      path: `/api${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${MAILERLITE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, res => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(response) });
        } catch (e) {
          resolve({ status: res.statusCode, data: response });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function buildEmailHTML(recipes) {
  const recipeCards = recipes.map(r => {
    const imgUrl = `${SITE_URL}${r.image || `/recipes/${r.slug}/images/hero.webp`}`;
    const recipeUrl = `${SITE_URL}/recipes/${r.slug}/`;
    const time = r.totalTime ? `⏱ ${r.totalTime}` : '';
    const servings = r.servings ? `· Serves ${r.servings}` : '';
    
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e0d0;border-radius:8px;overflow:hidden;">
      <tr>
        <td>
          <a href="${recipeUrl}" style="display:block;text-decoration:none;">
            <img src="${imgUrl}" alt="${r.title}" width="100%" style="display:block;max-height:220px;object-fit:cover;" />
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#52b788;font-family:Arial,sans-serif;">${r.category || 'Recipe'} · ${r.cuisine || 'American'}</p>
          <h3 style="margin:0 0 8px;font-size:20px;font-family:Georgia,serif;color:#1a1a1a;line-height:1.3;">
            <a href="${recipeUrl}" style="color:#1a1a1a;text-decoration:none;">${r.title}</a>
          </h3>
          <p style="margin:0 0 12px;font-size:14px;color:#666;line-height:1.6;font-family:Arial,sans-serif;">${(r.description || '').substring(0, 120)}...</p>
          <p style="margin:0 0 12px;font-size:12px;color:#888;font-family:Arial,sans-serif;">${time} ${servings}</p>
          <a href="${recipeUrl}" style="display:inline-block;background:#2d6a4f;color:#fff;text-decoration:none;padding:10px 20px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Get Recipe →</a>
        </td>
      </tr>
    </table>`;
  }).join('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          
          <!-- Header -->
          <tr>
            <td style="background:#2d6a4f;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#fff;font-weight:normal;">
                <em>Improv Oven</em>
              </h1>
              <p style="margin:8px 0 0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Daily Recipe Digest</p>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="background:#fff;padding:24px 32px;border-bottom:1px solid #e8e0d0;">
              <p style="margin:0;font-size:15px;color:#555;line-height:1.7;">
                Good morning! Here's what came out of the Improv Oven yesterday — <strong>${recipes.length} new recipes</strong> ready for your weekly lineup. ${today}.
              </p>
            </td>
          </tr>

          <!-- Recipes -->
          <tr>
            <td style="padding:24px 32px;background:#f8f7f4;">
              ${recipeCards}
            </td>
          </tr>

          <!-- Browse all -->
          <tr>
            <td style="background:#fff;padding:24px 32px;text-align:center;border-top:1px solid #e8e0d0;">
              <a href="${SITE_URL}/recipes/" style="display:inline-block;background:#2d6a4f;color:#fff;text-decoration:none;padding:14px 32px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Browse All Recipes</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999;">
                You're receiving this because you subscribed at <a href="${SITE_URL}" style="color:#2d6a4f;">improvoven.com</a><br>
                <a href="{$unsubscribe}" style="color:#999;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getYesterdaysRecipes(recipes) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const yesterdays = recipes.filter(r => 
    r.date === yesterdayStr && !r.isRoundup
  );

  console.log(`Looking for recipes from ${yesterdayStr}`);
  console.log(`Found ${yesterdays.length} recipes from yesterday`);
  
  // If none from yesterday, take the 4 most recent non-roundup recipes
  if (yesterdays.length === 0) {
    console.log('No recipes from yesterday — using 4 most recent');
    return recipes.filter(r => !r.isRoundup).slice(0, 4);
  }
  
  return yesterdays;
}

async function main() {
  console.log('📧 Starting daily digest send...\n');

  if (!MAILERLITE_API_KEY) {
    throw new Error('MAILERLITE_API_KEY not set');
  }

  // Load recipes
  const recipes = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'recipes-data.json'), 'utf8'
  ));

  const todayRecipes = getYesterdaysRecipes(recipes);
  
  if (todayRecipes.length === 0) {
    console.log('No recipes to send — skipping');
    return;
  }

  console.log(`📋 Sending digest with ${todayRecipes.length} recipes:`);
  todayRecipes.forEach(r => console.log(`   - ${r.title}`));

  // Build email content
  const html = buildEmailHTML(todayRecipes);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = `🍳 ${todayRecipes.length} new recipes from Improv Oven (${dateStr})`;

  // Create campaign
  console.log('\n📤 Creating MailerLite campaign...');
  const campaignRes = await mailerliteRequest('POST', '/campaigns', {
    name: `Daily Digest ${new Date().toISOString().split('T')[0]}`,
    type: 'regular',
    status: 'draft',
    emails: [{
      subject,
      from_name: 'Improv Oven',
      from: 'info@improvoven.com',
      content: html,
      reply_to: 'info@improvoven.com'
    }],
    groups: [GROUP_ID]
  });

  if (campaignRes.status !== 201 && campaignRes.status !== 200) {
    throw new Error(`Failed to create campaign: ${JSON.stringify(campaignRes.data)}`);
  }

  const campaignId = campaignRes.data.data?.id;
  console.log(`✓ Campaign created: ${campaignId}`);

  // Schedule for immediate send
  console.log('📨 Scheduling campaign to send now...');
  const scheduleRes = await mailerliteRequest('POST', `/campaigns/${campaignId}/schedule`, {
    delivery: 'instant'
  });

  if (scheduleRes.status === 200 || scheduleRes.status === 201) {
    console.log(`\n✅ Daily digest sent successfully!`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Recipes: ${todayRecipes.length}`);
  } else {
    throw new Error(`Failed to schedule: ${JSON.stringify(scheduleRes.data)}`);
  }
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
