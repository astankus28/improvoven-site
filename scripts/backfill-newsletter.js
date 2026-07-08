// backfill-newsletter.js
// Adds the MailerLite signup section to all existing recipe pages that are
// missing it, and removes any stale Mailchimp forms.
// Safe to re-run — skips pages that already have the MailerLite snippet.

const fs = require('fs');
const path = require('path');

const MAILERLITE_SCRIPT = `<script>(function(w,d,e,u,f,l,n){w[f]=w[f]||function(){(w[f].q=w[f].q||[]).push(arguments);},l=d.createElement(e),l.async=1,l.src=u,n=d.getElementsByTagName(e)[0],n.parentNode.insertBefore(l,n);})(window,document,'script','https://assets.mailerlite.com/js/universal.js','ml');ml('account','2222920');</script>`;

const NEWSLETTER_SECTION = `<div class="newsletter-section">
  <div class="newsletter-inner">
    <h2 class="newsletter-title">A new recipe every day</h2>
    <p class="newsletter-sub">Simple, budget-friendly recipes delivered to your inbox — no fluff, just food.</p>
    <div class="ml-embedded" data-form="183156308189382424"></div>
  </div>
</div>`;

const NEWSLETTER_CSS = `.newsletter-section{background:#2d6a4f;padding:3rem 2rem;margin-top:3rem}.newsletter-inner{max-width:540px;margin:0 auto;text-align:center}.newsletter-title{font-family:'Playfair Display',serif;font-size:1.8rem;color:#fff;margin-bottom:0.6rem}.newsletter-sub{color:rgba(255,255,255,0.85);font-size:0.95rem;margin-bottom:1.5rem;line-height:1.6}`;

const MAILCHIMP_RE = /<form[^>]*list-manage\.com[^>]*>[\s\S]*?<\/form>/gi;
const OLD_SIGNUP_WRAP_RE = /<div[^>]*class="[^"]*signup[^"]*"[^>]*>[\s\S]*?<\/div>/gi;

const recipesDir = path.join(process.cwd(), 'recipes');

function processFile(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Skip if already has MailerLite
  if (html.includes('ml-embedded') || html.includes('mailerlite.com/js/universal')) {
    return 'skip';
  }

  // Remove any Mailchimp forms
  html = html.replace(MAILCHIMP_RE, '');

  // Inject newsletter CSS into <style> block if not present
  if (!html.includes('newsletter-section') && html.includes('</style>')) {
    html = html.replace('</style>', `${NEWSLETTER_CSS}\n</style>`);
  }

  // Insert newsletter section + ML script before </body>
  if (!html.includes('</body>')) return 'skip';
  html = html.replace('</body>', `${NEWSLETTER_SECTION}\n${MAILERLITE_SCRIPT}\n</body>`);

  // Fix footer margin-top (it now has the newsletter section above it)
  html = html.replace('margin-top:4rem}', 'margin-top:0}');

  fs.writeFileSync(htmlPath, html);
  return 'updated';
}

const entries = fs.readdirSync(recipesDir, { withFileTypes: true });
let updated = 0, skipped = 0, errors = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const htmlPath = path.join(recipesDir, entry.name, 'index.html');
  if (!fs.existsSync(htmlPath)) continue;
  try {
    const result = processFile(htmlPath);
    if (result === 'updated') updated++;
    else skipped++;
  } catch (e) {
    console.error(`  ❌ ${entry.name}: ${e.message}`);
    errors++;
  }
}

console.log(`\n✅ Done. Updated: ${updated} | Already had it (skipped): ${skipped} | Errors: ${errors}`);
