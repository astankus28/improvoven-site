#!/usr/bin/env node
'use strict';

// Exchanges the Pinterest refresh token, then stores the rotated pair in
// GitHub Actions secrets. Pinterest spends the refresh token it just accepted
// and returns a new one (60-day continuous refresh). If that new value is not
// saved, the next run dies with "Refresh token is expired."
//
// gh encrypts and writes the secret. Do not import libsodium from a URL —
// Node cannot load https:// imports, and a swallowed failure here is how the
// previous token was left to expire.

const https = require('https');
const fs = require('fs');
const { execFileSync } = require('child_process');

const appId = process.env.PINTEREST_APP_ID;
const appSecret = process.env.PINTEREST_APP_SECRET;
const refreshToken = process.env.PINTEREST_REFRESH_TOKEN;
const ghToken = process.env.GH_TOKEN;
const ghRepo = process.env.GH_REPO;

function fail(message) {
  console.error('❌ ' + message);
  process.exit(1);
}

if (!refreshToken) {
  fail('No PINTEREST_REFRESH_TOKEN found in secrets. Re-authorize the Pinterest app and save a new refresh token.');
}
if (!appId || !appSecret) {
  fail('PINTEREST_APP_ID or PINTEREST_APP_SECRET is missing.');
}
if (!ghToken) {
  fail('No GH_TOKEN (repo secret PINTEREST_GH_PAT). It must be a PAT with Secrets: Read and write. GITHUB_TOKEN cannot update secrets.');
}
if (!ghRepo) {
  fail('GH_REPO is missing.');
}

function requestToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();
  const credentials = Buffer.from(appId + ':' + appSecret).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.pinterest.com',
      path: '/v5/oauth/token',
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + credentials,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          reject(new Error('Pinterest response was not JSON (HTTP ' + res.statusCode + ')'));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300 || !parsed.access_token) {
          reject(new Error('Token refresh failed: ' + JSON.stringify(parsed)));
          return;
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function setGitHubSecret(name, value) {
  try {
    execFileSync('gh', ['secret', 'set', name, '--repo', ghRepo], {
      input: value,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const detail = (e.stderr && e.stderr.toString().trim()) || e.message;
    throw new Error('Could not update GitHub secret ' + name + ': ' + detail);
  }
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delim = 'EOF_' + name.toUpperCase();
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    name + '<<' + delim + '\n' + value + '\n' + delim + '\n'
  );
}

(async () => {
  console.log('🔄 Refreshing Pinterest access token...');
  let token;
  try {
    token = await requestToken();
  } catch (e) {
    console.error('❌ ' + e.message);
    if (/expired/i.test(e.message)) {
      console.error('PINTEREST_REFRESH_TOKEN is expired. Generate a new one with the Authorization Code flow (continuous_refresh=true) and update that secret. Re-running this job will not fix it.');
    }
    process.exit(1);
  }

  if (!token.refresh_token) {
    fail('Pinterest did not return a new refresh_token. Refusing to continue, because the refresh token just used may already be spent.');
  }

  console.log('::add-mask::' + token.access_token);
  console.log('::add-mask::' + token.refresh_token);

  if (token.refresh_token_expires_in) {
    const days = Math.round(token.refresh_token_expires_in / 86400);
    console.log('Refresh token expires in ' + days + ' days');
  }

  try {
    // Refresh token first. If this write fails, the access-token secret is
    // left alone and the error tells you the new refresh token was not stored.
    setGitHubSecret('PINTEREST_REFRESH_TOKEN', token.refresh_token);
    setGitHubSecret('PINTEREST_ACCESS_TOKEN', token.access_token);
  } catch (e) {
    console.error('❌ ' + e.message);
    console.error('The new refresh token was not saved. Update PINTEREST_REFRESH_TOKEN before the next run, or re-authorize. PINTEREST_GH_PAT needs Secrets: Read and write on this repo.');
    process.exit(1);
  }

  writeOutput('access_token', token.access_token);
  console.log('✅ Token refreshed and GitHub secrets updated');
})();
