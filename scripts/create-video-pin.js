#!/usr/bin/env node

/**
 * create-video-pin.js
 * Converts a recipe hero image into a short ken burns video
 * and posts it to Pinterest as a video pin.
 *
 * Reuses board resolution logic from pinterest-post.js so no
 * new secrets or board IDs are needed.
 *
 * Deps installed in the workflow step:
 *   form-data (node-fetch is already in the project)
 */

const { execSync }  = require('child_process');
const fs            = require('fs');
const path          = require('path');
const https         = require('https');
const FormData      = require('form-data');

// Reuse hashtag helper from the existing pinterest-post.js
const { generateHashtags } = require(path.join(__dirname, 'pinterest-post.js'));

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN;
const SITE_URL     = 'https://www.improvoven.com';

// Must match BOARD_MAP in pinterest-post.js
const BOARD_MAP = {
  breakfast:      'Easy Breakfast Recipes',
  dessert:        'Easy Dessert Recipes',
  italian:        'Italian Recipes',
  latin:          'Latin & Miami Recipes',
  mexican:        'Latin & Miami Recipes',
  cuban:          'Latin & Miami Recipes',
  venezuelan:     'Latin & Miami Recipes',
  argentine:      'Latin & Miami Recipes',
  'puerto rican': 'Latin & Miami Recipes',
  caribbean:      'Latin & Miami Recipes',
  quick:          '30-Minute Meals',
  budget:         'Budget Meals Under $10',
  default:        'Easy Weeknight Dinners',
};

// Video settings
const VIDEO_DURATION = 10;    // seconds
const VIDEO_WIDTH    = 1080;
const VIDEO_HEIGHT   = 1350;  // 4:5 — Pinterest's preferred video ratio
const FPS            = 25;

// ─── Board resolution (mirrors pinterest-post.js) ─────────────────────────────

function getBoardName(recipe) {
  const category = (recipe.category || '').toLowerCase();
  const cuisine  = (recipe.cuisine  || '').toLowerCase();
  const keyword  = (recipe.targetKeyword || '').toLowerCase();

  if (category === 'breakfast' || keyword.includes('breakfast')) return BOARD_MAP.breakfast;
  if (category === 'dessert' || keyword.includes('dessert') || keyword.includes('cookie') || keyword.includes('cake')) return BOARD_MAP.dessert;
  if (cuisine.includes('italian')) return BOARD_MAP.italian;
  if (['latin american','mexican','cuban','venezuelan','argentine','puerto rican','latin caribbean','cuban-american'].some(c => cuisine.includes(c))) return BOARD_MAP.latin;
  if (keyword.includes('budget') || keyword.includes('cheap') || keyword.includes('affordable')) return BOARD_MAP.budget;
  if (keyword.includes('30 minute') || keyword.includes('20 minute') || keyword.includes('quick')) return BOARD_MAP.quick;
  return BOARD_MAP.default;
}

function pinterestRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.pinterest.com',
      path: `/v5${endpoint}`,
      method,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let response = '';
      res.on('data', chunk => (response += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(response) }); }
        catch { resolve({ status: res.statusCode, data: response }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getOrCreateBoard(boardName) {
  const res = await pinterestRequest('GET', '/boards?page_size=100');
  if (res.status !== 200) throw new Error(`Failed to get boards: ${JSON.stringify(res.data)}`);

  const existing = (res.data.items || []).find(b => b.name.toLowerCase() === boardName.toLowerCase());
  if (existing) {
    console.log(`✓ Board found: ${boardName} (${existing.id})`);
    return existing.id;
  }

  const createRes = await pinterestRequest('POST', '/boards', {
    name: boardName,
    description: `${boardName} from Improv Oven — simple, budget-friendly recipes with a Miami twist.`,
    privacy: 'PUBLIC',
  });
  if (createRes.status !== 201) throw new Error(`Failed to create board: ${JSON.stringify(createRes.data)}`);
  console.log(`✓ Board created: ${boardName} (${createRes.data.id})`);
  return createRes.data.id;
}

// ─── Video creation ───────────────────────────────────────────────────────────

function createVideo(heroImagePath, title, outputPath) {
  const totalFrames   = VIDEO_DURATION * FPS;
  const zoomIncrement = (0.08 / totalFrames).toFixed(6);

  // Wrap title at ~28 chars for two-line display
  const words = title.split(' ');
  let line1 = '', line2 = '';
  for (const w of words) {
    if (line1.length + w.length < 28) line1 += (line1 ? ' ' : '') + w;
    else line2 += (line2 ? ' ' : '') + w;
  }

  // Escape text for ffmpeg drawtext
  const escape = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const displayText = line2 ? `${escape(line1)}\n${escape(line2)}` : escape(title);

  // ffmpeg is pre-installed on ubuntu-latest GitHub Actions runners
  const ffmpeg = 'ffmpeg';

  // Try DejaVu bold (ubuntu-latest has it), fall back to no custom font
  const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const fontArg  = fs.existsSync(fontPath) ? `fontfile=${fontPath}:` : '';

  const filter = [
    `[0:v]`,
    `scale=iw*2:ih*2,`,
    `zoompan=`,
      `z='min(zoom+${zoomIncrement},1.08)':`,
      `x='iw/2-(iw/zoom/2)':`,
      `y='ih/2-(ih/zoom/2)':`,
      `d=${totalFrames}:`,
      `s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:`,
      `fps=${FPS},`,
    `drawbox=y=(ih*0.72):w=iw:h=(ih*0.22):color=black@0.55:t=fill,`,
    `drawtext=`,
      `text='${displayText}':`,
      `${fontArg}`,
      `fontsize=52:`,
      `fontcolor=white:`,
      `x=(w-text_w)/2:`,
      `y=(h*0.75):`,
      `line_spacing=12`,
    `[v]`,
  ].join('');

  const cmd = [
    ffmpeg, '-y',
    `-loop 1 -i "${heroImagePath}"`,
    `-f lavfi -i anullsrc=r=44100:cl=mono`,
    `-filter_complex "${filter}"`,
    `-map "[v]" -map 1:a`,
    `-c:v libx264 -preset fast -crf 23`,
    `-c:a aac -b:a 64k`,
    `-t ${VIDEO_DURATION}`,
    `-pix_fmt yuv420p`,
    `-movflags +faststart`,
    `"${outputPath}"`,
  ].join(' ');

  console.log('🎬 Running ffmpeg...');
  execSync(cmd, { stdio: 'inherit' });
  console.log(`✅ Video created: ${outputPath}`);
}

// ─── Pinterest video upload (3-step) ─────────────────────────────────────────

async function registerVideoUpload() {
  const res = await pinterestRequest('POST', '/media', { media_type: 'video' });
  if (res.status !== 201) throw new Error(`Pinterest media register failed: ${res.status} — ${JSON.stringify(res.data)}`);
  return res.data; // { media_id, upload_url, upload_parameters }
}

async function uploadVideoFile(videoPath, uploadUrl, uploadParameters) {
  const form = new FormData();
  // S3 signature fields must come before the file
  for (const [key, value] of Object.entries(uploadParameters)) {
    form.append(key, value);
  }
  form.append('file', fs.createReadStream(videoPath), {
    filename: path.basename(videoPath),
    contentType: 'video/mp4',
  });

  const nodeFetch = require('node-fetch');
  const res = await nodeFetch(uploadUrl, { method: 'POST', body: form });

  if (res.status !== 204 && res.status !== 200) {
    const err = await res.text();
    throw new Error(`S3 video upload failed: ${res.status} — ${err}`);
  }
  console.log('✅ Video uploaded to Pinterest storage');
}

async function waitForVideoProcessing(mediaId, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await pinterestRequest('GET', `/media/${mediaId}`);
    const status = res.data.status;
    console.log(`  ⏳ Video status: ${status}`);
    if (status === 'succeeded') return;
    if (status === 'failed') throw new Error('Pinterest video processing failed');
    await new Promise(r => setTimeout(r, 8000));
  }
  throw new Error('Timed out waiting for Pinterest video processing');
}

async function createVideoPin(recipe, slug, boardId, mediaId) {
  const recipeUrl  = `${SITE_URL}/recipes/${slug}/`;
  const hashtags   = generateHashtags(recipe).join(' ');
  const desc       = recipe.description || recipe.title;
  const description = `${desc} 📌 Save this recipe! Full instructions at the link. ${hashtags}`.substring(0, 500);

  const body = {
    board_id: boardId,
    title: recipe.title.substring(0, 100),
    description,
    link: recipeUrl,
    media_source: { source_type: 'video_id', media_id: mediaId },
  };

  const res = await pinterestRequest('POST', '/pins', body);
  if (res.status !== 201) throw new Error(`Pin creation failed: ${res.status} — ${JSON.stringify(res.data)}`);

  console.log(`✅ Video pin created: https://www.pinterest.com/pin/${res.data.id}/`);
  return res.data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function createAndPostVideoPin(recipe, slug) {
  if (!ACCESS_TOKEN) throw new Error('PINTEREST_ACCESS_TOKEN not set');

  // Locate hero image
  const heroDir   = path.join(__dirname, '..', 'recipes', slug, 'images');
  const heroWebp  = path.join(heroDir, 'hero.webp');
  const heroJpg   = path.join(heroDir, 'hero.jpg');
  const heroImage = fs.existsSync(heroWebp) ? heroWebp : heroJpg;
  if (!fs.existsSync(heroImage)) throw new Error(`Hero image not found for ${slug}`);

  const videoPath = path.join(heroDir, 'video-pin.mp4');

  // 1. Render video
  createVideo(heroImage, recipe.title, videoPath);

  // 2. Resolve board (same logic as static pin)
  const boardName = getBoardName(recipe);
  const boardId   = await getOrCreateBoard(boardName);

  // 3. Register upload
  console.log('📡 Registering video with Pinterest...');
  const { media_id, upload_url, upload_parameters } = await registerVideoUpload();
  console.log(`   media_id: ${media_id}`);

  // 4. Upload to S3
  await uploadVideoFile(videoPath, upload_url, upload_parameters);

  // 5. Wait for processing
  console.log('⏳ Waiting for Pinterest to process video...');
  await waitForVideoProcessing(media_id);

  // 6. Create the pin
  console.log('📌 Creating video pin...');
  const pin = await createVideoPin(recipe, slug, boardId, media_id);

  // 7. Clean up local MP4 (don't commit to repo)
  fs.unlinkSync(videoPath);
  console.log('🗑️  Local MP4 cleaned up');

  return pin;
}

module.exports = { createAndPostVideoPin };

// Direct test: node scripts/create-video-pin.js <slug>
if (require.main === module) {
  const recipes = require('../recipes-data.json');
  const slug    = process.argv[2] || recipes[0].slug;
  const recipe  = recipes.find(r => r.slug === slug) || recipes[0];
  createAndPostVideoPin(recipe, slug)
    .then(() => process.exit(0))
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}
