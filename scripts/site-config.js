'use strict';

/** Shared URLs and GA4 snippet for static HTML generators and backfill scripts. */
const SITE_URL = 'https://www.improvoven.com';
const GA_MEASUREMENT_ID = 'G-78N6SPVJ7F';

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
};
