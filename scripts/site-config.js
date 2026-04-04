'use strict';

/** Shared URLs and GA4 snippet for static HTML generators and backfill scripts.
 * IndexNow: key file at repo root `{INDEXNOW_KEY}.txt` (same string as body). Override with env INDEXNOW_KEY. */
const SITE_URL = 'https://www.improvoven.com';
const GA_MEASUREMENT_ID = 'G-78N6SPVJ7F';

const INDEXNOW_KEY = (process.env.INDEXNOW_KEY || '748a9b460b0beadf9e3c0ccd04d542c5').trim();
const INDEXNOW_KEY_LOCATION =
  process.env.INDEXNOW_KEY_LOCATION ||
  `${SITE_URL.replace(/\/$/, '')}/${INDEXNOW_KEY}.txt`;

const GTAG_SNIPPET = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_MEASUREMENT_ID}');
</script>`;

module.exports = {
  SITE_URL,
  GA_MEASUREMENT_ID,
  GTAG_SNIPPET,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
};
