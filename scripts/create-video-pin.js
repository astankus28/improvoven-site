#!/usr/bin/env node

/**
 * create-video-pin.js
 * Converts a recipe hero image into a short ken burns video
 * and posts it to Pinterest as a video pin.
 */

const { execFileSync } = require('child_process');
const fs               = require('fs');
const path             = require('path');
const https            = require('https');
const FormData         = require('form-data');

const { generateHashtags } = require(path.join(__dirname, 'pinterest-post.js'));

const ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN;
const SITE_URL     = 'https://www.improvoven.com';

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

const VIDEO_DURATION = 10;
const VIDEO_WIDTH    = 1080;
const VIDEO_HEIGHT   = 1350;
const FPS            = 25;

/** Prefer Linux CI font, then common fallbacks for local macOS runs. */
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

function resolveFontfile() {
  const hit = FONT_CANDIDATES.find((p) => fs.existsSync(p));
  return hit || null;
}

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

function wrapTitle(title) {
  // Split title in half by character count, keeping word boundaries
  const words = title.split(' ');
  const half = Math.ceil(title.length / 2);
  let line1 = '', line2 = '', assigned = false;

  for (const w of words) {
    if (!assigned && line1.length + w.length <= half) {
      line1 += (line1 ? ' ' : '') + w;
    } else {
      assigned = true;
      line2 += (line2 ? ' ' : '') + w;
    }
  }

  // If line2 is very long, truncate it
  if (line2.length > 40) line2 = line2.substring(0, 37) + '...';

  return line2 ? `${line1}\n${line2}` : line1;
}

function createVideo(heroImagePath, title, outputPath) {
  const totalFrames   = VIDEO_DURATION * FPS;
  const zoomIncrement = (0.08 / totalFrames).toFixed(6);

  // drawtext=text='…' breaks on multiline titles and many special chars; textfile is reliable.
  // Keep the file next to the MP4 (simple ASCII path under recipes/<slug>/images/).
  const titleFile = outputPath.replace(/\.mp4$/i, '') + '-overlay-title.txt';
  fs.writeFileSync(titleFile, wrapTitle(title), 'utf8');

  const fontPath = resolveFontfile();
  /** Windows drive letter only — Unix paths have no `:` and must not be over-escaped. */
  const escPath = (p) => {
    const s = path.resolve(p).replace(/\\/g, '/');
    return /^[A-Za-z]:\//.test(s) ? `${s[0]}\\:${s.slice(3)}` : s;
  };

  const fontPrefix = fontPath ? `fontfile=${escPath(fontPath)}:` : '';

  const filter = [
    `[0:v]scale=iw*2:ih*2,`,
    `zoompan=`,
    `z='min(zoom+${zoomIncrement},1.08)':`,
    `x='iw/2-(iw/zoom/2)':`,
    `y='ih/2-(ih/zoom/2)':`,
    `d=${totalFrames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS},`,
    `drawbox=y=(ih*0.72):w=iw:h=(ih*0.22):color=black@0.55:t=fill,`,
    `drawtext=${fontPrefix}textfile=${escPath(titleFile)}:`,
    `fontsize=52:fontcolor=white:x=(w-text_w)/2:y=(h*0.75):line_spacing=12:reload=0`,
    `[v]`,
  ].join('');

  const args = [
    '-y',
    '-loop', '1',
    '-i', heroImagePath,
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=mono',
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '64k',
    '-t', String(VIDEO_DURATION),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  console.log('🎬 Running ffmpeg...');
  if (!fontPath) {
    console.warn('⚠ No TTF font found — drawtext may fail. Install fonts-dejavu-core (Linux) or use a Mac with Arial.');
  }
  try {
    execFileSync('ffmpeg', args, { stdio: 'inherit' });
  } finally {
    try {
      fs.unlinkSync(titleFile);
    } catch {
      /* ignore */
    }
  }
  console.log(`✅ Video created: ${outputPath}`);
}

async function registerVideoUpload() {
  const res = await pinterestRequest('POST', '/media', { media_type: 'video' });
  if (res.status !== 201) throw new Error(`Pinterest media register failed: ${res.status} — ${JSON.stringify(res.data)}`);
  return res.data;
}

async function uploadVideoFile(videoPath, uploadUrl, uploadParameters) {
  const form = new FormData();
  for (const [key, value] of Object.entries(uploadParameters)) {
    form.append(key, value);
  }
  form.append('file', fs.createReadStream(videoPath), {
    filename: path.basename(videoPath),
    contentType: 'video/mp4',
    knownLength: fs.statSync(videoPath).size,
  });

  return new Promise((resolve, reject) => {
    form.getLength((err, length) => {
      if (err) return reject(err);
      const req = https.request(uploadUrl, {
        method: 'POST',
        headers: { ...form.getHeaders(), 'Content-Length': length },
      }, res => {
        res.resume();
        if (res.statusCode === 204 || res.statusCode === 200) {
          console.log('✅ Video uploaded to Pinterest storage');
          resolve();
        } else {
          reject(new Error(`S3 video upload failed: ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      form.pipe(req);
    });
  });
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
  const recipeUrl   = `${SITE_URL}/recipes/${slug}/`;
  const hashtags    = generateHashtags(recipe).join(' ');
  const desc        = recipe.description || recipe.title;
  const description = `${desc} 📌 Save this recipe! Full instructions at the link. ${hashtags}`.substring(0, 500);

  const body = {
    board_id: boardId,
    title: recipe.title.substring(0, 100),
    description,
    link: recipeUrl,
    media_source: {
      source_type: 'video_id',
      media_id: mediaId,
    },
    cover_image_key_frame_time: 3, // Pinterest extracts frame at 3 seconds as cover thumbnail
  };

  const res = await pinterestRequest('POST', '/pins', body);
  if (res.status !== 201) throw new Error(`Pin creation failed: ${res.status} — ${JSON.stringify(res.data)}`);

  console.log(`✅ Video pin created: https://www.pinterest.com/pin/${res.data.id}/`);
  return res.data;
}

async function createAndPostVideoPin(recipe, slug) {
  if (!ACCESS_TOKEN) throw new Error('PINTEREST_ACCESS_TOKEN not set');

  const heroDir   = path.join(__dirname, '..', 'recipes', slug, 'images');
  const heroJpg   = path.join(heroDir, 'hero.jpg');
  const heroWebp  = path.join(heroDir, 'hero.webp');
  const heroImage = fs.existsSync(heroJpg) ? heroJpg : heroWebp;
  if (!fs.existsSync(heroImage)) throw new Error(`Hero image not found for ${slug}`);

  const videoPath = path.join(heroDir, 'video-pin.mp4');

  createVideo(heroImage, recipe.title, videoPath);

  const boardName = getBoardName(recipe);
  const boardId   = await getOrCreateBoard(boardName);

  console.log('📡 Registering video with Pinterest...');
  const { media_id, upload_url, upload_parameters } = await registerVideoUpload();
  console.log(`   media_id: ${media_id}`);

  await uploadVideoFile(videoPath, upload_url, upload_parameters);

  console.log('⏳ Waiting for Pinterest to process video...');
  await waitForVideoProcessing(media_id);

  console.log('📌 Creating video pin...');
  const pin = await createVideoPin(recipe, slug, boardId, media_id);

  fs.unlinkSync(videoPath);
  console.log('🗑️  Local MP4 cleaned up');

  return pin;
}

module.exports = { createAndPostVideoPin };

if (require.main === module) {
  const recipes = require('../recipes-data.json');
  const slug    = process.argv[2] || recipes[0].slug;
  const recipe  = recipes.find(r => r.slug === slug) || recipes[0];
  createAndPostVideoPin(recipe, slug)
    .then(() => process.exit(0))
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}
