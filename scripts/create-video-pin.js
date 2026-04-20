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

// ─── Video geometry ──────────────────────────────────────────────────────────
const VIDEO_WIDTH    = 1080;
const VIDEO_HEIGHT   = 1350;          // 4:5 — Pinterest's preferred vertical aspect
const FPS            = 30;

// ─── Shot timing ─────────────────────────────────────────────────────────────
// Three Ken-Burns "shots" derived from the same hero image (different framings),
// crossfaded together, then a brand outro card.  Total ≈ 12s.
const SHOT_DURATION  = 4.0;           // seconds per shot
const XFADE_DURATION = 0.6;           // crossfade overlap between shots
const OUTRO_DURATION = 2.0;           // brand card at the end
const OUTRO_XFADE    = 0.5;           // crossfade into the outro
const NUM_SHOTS      = 3;

// Effective total = SHOT*N − XFADE*(N−1) + OUTRO − OUTRO_XFADE
const TOTAL_DURATION =
  SHOT_DURATION * NUM_SHOTS
  - XFADE_DURATION * (NUM_SHOTS - 1)
  + OUTRO_DURATION
  - OUTRO_XFADE;

// ─── Brand ───────────────────────────────────────────────────────────────────
// Colors mirror the site's CSS custom properties (see /index.html :root).
const BRAND_GREEN       = '0x2D6A4F';
const BRAND_GREEN_LIGHT = '0x52B788';
const BRAND_CREAM       = '0xFAF7F2';
const BRAND_DOMAIN      = 'improvoven.com';

// ─── Audio ───────────────────────────────────────────────────────────────────
// Bundled CC BY 4.0 music bed: "Carefree" by Kevin MacLeod (incompetech.com).
// CREDITS in /assets/audio/CREDITS.md.  Required attribution string below is
// appended to every video pin description so we stay license-compliant.
const MUSIC_BED_PATH = path.join(__dirname, '..', 'assets', 'audio', 'pin-bed.mp3');
const MUSIC_CREDIT   = 'Music: "Carefree" by Kevin MacLeod (incompetech.com), CC BY 4.0';

// ─── Fonts ───────────────────────────────────────────────────────────────────
// CI (Linux/Ubuntu) installs `fonts-dejavu-core`; macOS dev boxes have Arial.
// We need a regular + bold pair so the outro can mix weights.
const BOLD_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];
const REGULAR_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

function resolveFont(candidates) {
  const hit = candidates.find((p) => fs.existsSync(p));
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

function wrapTitle(title, maxLine = 22) {
  // 1. Drop any parenthetical "(Spicy, Fudgy & Totally Addictive)"-style tail —
  //    it reads as marketing copy and bloats the overlay. Keep only the dish name.
  const dish = title.replace(/\s*\(.*?\)\s*$/g, '').trim() || title;

  // 2. Greedy wrap into <=2 lines, soft target ~maxLine chars per line so the
  //    type stays inside a 1080-wide frame with margins.
  const words = dish.split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxLine || !cur) {
      lines[lines.length - 1] = candidate;
    } else if (lines.length < 2) {
      lines.push(w);
    } else {
      // 3rd+ word that won't fit — append with ellipsis and stop.
      lines[1] = (lines[1] + ' ' + w).slice(0, maxLine - 1).trimEnd() + '…';
      break;
    }
  }
  return lines.filter(Boolean).join('\n');
}

// Three "shots" derived from one hero image. zStart/zEnd are zoom factors
// (1.0 = no zoom). xCenter/yCenter are 0..1 within the full frame and steer
// where the zoompan crop is centered, giving each shot a different framing.
const SHOT_RECIPES = [
  // Wide establishing — slow push-in, centered.
  { zStart: 1.00, zEnd: 1.10, xCenter: 0.50, yCenter: 0.50 },
  // Top detail — punch in on the surface (toppings / texture).
  { zStart: 1.30, zEnd: 1.40, xCenter: 0.50, yCenter: 0.32 },
  // Pull-out reveal from a side angle.
  { zStart: 1.35, zEnd: 1.18, xCenter: 0.42, yCenter: 0.62 },
];

/**
 * Build the zoompan filter expression for one shot.  We pre-scale the input to
 * 2× the output resolution so zoompan's nearest-neighbor scaling doesn't soften
 * the image, then crop to a 4:5 canvas and animate.
 */
function shotFilter(label, recipe, durationSec) {
  const totalFrames = Math.round(durationSec * FPS);
  const W2 = VIDEO_WIDTH * 2;
  const H2 = VIDEO_HEIGHT * 2;
  const zStep = ((recipe.zEnd - recipe.zStart) / totalFrames).toFixed(6);
  const zStart = recipe.zStart.toFixed(4);
  // Clamp zoom between min(start,end) and max(start,end) so easing in either
  // direction (push-in or pull-out) never overshoots the target framing.
  const zMin = Math.min(recipe.zStart, recipe.zEnd).toFixed(4);
  const zMax = Math.max(recipe.zStart, recipe.zEnd).toFixed(4);
  // anchor x/y so the crop is centered on (xCenter, yCenter) of the source.
  // iw/ih here refer to the *post-scale* canvas (W2 × H2).
  const cx = recipe.xCenter.toFixed(3);
  const cy = recipe.yCenter.toFixed(3);
  return [
    // Take only the first input frame; zoompan with looped input otherwise
    // restarts its animation every input frame and breaks xfade offsets.
    `trim=end_frame=1,loop=loop=-1:size=1:start=0,setpts=N/${FPS}/TB,`,
    `scale=${W2}:${H2}:force_original_aspect_ratio=increase,`,
    `crop=${W2}:${H2},`,
    `zoompan=`,
    `z='clip(${zStart}+(${zStep})*on,${zMin},${zMax})':`,
    `x='iw*${cx}-(iw/zoom/2)':`,
    `y='ih*${cy}-(ih/zoom/2)':`,
    `d=${totalFrames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS},`,
    // Hard-bound the shot duration so xfade offsets line up exactly.
    `trim=duration=${durationSec.toFixed(3)},`,
    `setsar=1,setpts=PTS-STARTPTS[${label}]`,
  ].join('');
}

/**
 * Build the outro brand card as a colored canvas with logo-style typography.
 * Generated entirely in ffmpeg so we don't need to bundle a PNG outro.
 */
function outroFilter(label, fontPath, fontPathRegular) {
  const totalFrames = Math.round(OUTRO_DURATION * FPS);
  const fontPrefix  = fontPath ? `fontfile=${escFfPath(fontPath)}:` : '';
  const fontPrefixR = fontPathRegular ? `fontfile=${escFfPath(fontPathRegular)}:` : fontPrefix;
  // color source → drawtext for "Full Recipe" + drawtext for "improvoven.com"
  return [
    `color=c=#${BRAND_GREEN.slice(2)}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:r=${FPS}:d=${OUTRO_DURATION},`,
    // Soft inner highlight bar for visual interest
    `drawbox=x=0:y=(ih*0.46):w=iw:h=4:color=#${BRAND_GREEN_LIGHT.slice(2)}@0.9:t=fill,`,
    // "Full Recipe →" — bold, mid-upper
    `drawtext=${fontPrefix}text='Full Recipe →':`,
    `fontsize=92:fontcolor=#${BRAND_CREAM.slice(2)}:`,
    `x=(w-text_w)/2:y=(h*0.34),`,
    // "improvoven.com" — regular weight, mid-lower, with subtle fade-in
    `drawtext=${fontPrefixR}text='${BRAND_DOMAIN}':`,
    `fontsize=64:fontcolor=#${BRAND_GREEN_LIGHT.slice(2)}:`,
    `x=(w-text_w)/2:y=(h*0.52):`,
    `alpha='if(lt(t,0.4),t/0.4,1)',`,
    // Save Pin nudge near the bottom
    `drawtext=${fontPrefix}text='📌 Save & Cook Tonight':`,
    `fontsize=44:fontcolor=#${BRAND_CREAM.slice(2)}@0.85:`,
    `x=(w-text_w)/2:y=(h*0.78),`,
    `setsar=1,trim=duration=${OUTRO_DURATION},setpts=PTS-STARTPTS,fps=${FPS}[${label}]`,
  ].join('');
}

/** Escape a filesystem path for use inside an ffmpeg filter argument. */
function escFfPath(p) {
  const s = path.resolve(p).replace(/\\/g, '/');
  // Windows drive letter: C:/foo → C\:/foo  (Unix has no `:` in paths).
  return /^[A-Za-z]:\//.test(s) ? `${s[0]}\\:${s.slice(3)}` : s;
}

/**
 * Compose the full filter_complex for the multi-shot pin.
 *
 *   [0:v]split=N → 3 zoompan shots → xfade(s) → drawtext title with fade-in
 *                                            └→ xfade into outro card → [v]
 *   [music?]    → atrim/afade/volume                                  → [a]
 *
 * @returns {{ filter: string, hasMusic: boolean }}
 */
function buildFilterGraph(title) {
  const titleFontPath   = resolveFont(BOLD_FONT_CANDIDATES);
  const regularFontPath = resolveFont(REGULAR_FONT_CANDIDATES);
  if (!titleFontPath) {
    console.warn('⚠ No bold TTF font found — drawtext will fail in CI. Install fonts-dejavu-core.');
  }

  // --- Three zoompan shots fed from one image input ---
  const splitLabels = SHOT_RECIPES.map((_, i) => `s${i}`);
  const shotLabels  = SHOT_RECIPES.map((_, i) => `v${i}`);
  const parts = [];
  parts.push(`[0:v]split=${NUM_SHOTS}${splitLabels.map(l => `[${l}]`).join('')}`);
  SHOT_RECIPES.forEach((rec, i) => {
    parts.push(`[${splitLabels[i]}]${shotFilter(shotLabels[i], rec, SHOT_DURATION)}`);
  });

  // --- Crossfade the shots together: v0 + v1 → m1, m1 + v2 → m2 ---
  let prev = shotLabels[0];
  for (let i = 1; i < shotLabels.length; i++) {
    const next = shotLabels[i];
    const out  = i === shotLabels.length - 1 ? 'shots' : `m${i}`;
    // xfade offset = total elapsed visible time for `prev` chain
    const offset = (SHOT_DURATION * i) - (XFADE_DURATION * i);
    parts.push(
      `[${prev}][${next}]xfade=transition=fade:duration=${XFADE_DURATION}:offset=${offset.toFixed(3)}[${out}]`
    );
    prev = out;
  }

  // --- Title overlay across the shots, with fade-in / fade-out ---
  const motionDuration =
    SHOT_DURATION * NUM_SHOTS - XFADE_DURATION * (NUM_SHOTS - 1);
  const wrapped     = wrapTitle(title);
  const titleFile   = path.join(
    require('os').tmpdir(),
    `pinvid-title-${Date.now()}-${process.pid}.txt`
  );
  fs.writeFileSync(titleFile, wrapped, 'utf8');
  const titleFontPrefix = titleFontPath ? `fontfile=${escFfPath(titleFontPath)}:` : '';
  // Fade title in over 0.6s (after a 0.3s lead), fade out 0.6s before the
  // shots end so the crossfade into the outro is clean.
  const fadeIn  = 0.3;
  const fadeDur = 0.6;
  const fadeOutStart = motionDuration - fadeDur - 0.05;
  const titleAlpha =
    `'if(lt(t,${fadeIn}),0,if(lt(t,${fadeIn + fadeDur}),(t-${fadeIn})/${fadeDur},` +
    `if(lt(t,${fadeOutStart}),1,if(lt(t,${fadeOutStart + fadeDur}),` +
    `1-(t-${fadeOutStart})/${fadeDur},0))))'`;
  parts.push(
    `[shots]drawbox=y=(ih*0.74):w=iw:h=(ih*0.26):color=black@0.62:t=fill,` +
    `drawtext=${titleFontPrefix}textfile=${escFfPath(titleFile)}:` +
    `fontsize=64:fontcolor=white:borderw=2:bordercolor=black@0.55:` +
    `x=(w-text_w)/2:y=(h*0.78):line_spacing=14:reload=0:alpha=${titleAlpha}` +
    `[shotsTxt]`
  );

  // --- Outro brand card + crossfade in ---
  parts.push(outroFilter('outro', titleFontPath, regularFontPath));
  const outroOffset = motionDuration - OUTRO_XFADE;
  parts.push(
    `[shotsTxt][outro]xfade=transition=fade:duration=${OUTRO_XFADE}:offset=${outroOffset.toFixed(3)}[v]`
  );

  // --- Audio bed (optional, with graceful fallback) ---
  const hasMusic = fs.existsSync(MUSIC_BED_PATH);
  if (hasMusic) {
    // Trim/loop music to fit, fade in/out, mix down to mono so file stays small.
    parts.push(
      `[1:a]aloop=loop=-1:size=2e9,atrim=duration=${TOTAL_DURATION},` +
      `asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=0.4,` +
      `afade=t=out:st=${(TOTAL_DURATION - 0.6).toFixed(3)}:d=0.6,` +
      `volume=0.55[a]`
    );
  } else {
    parts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${TOTAL_DURATION}[a]`);
  }

  return { filter: parts.join(';'), hasMusic, titleFile };
}

function createVideo(heroImagePath, title, outputPath) {
  const { filter, hasMusic, titleFile } = buildFilterGraph(title);

  const inputs = ['-loop', '1', '-t', String(TOTAL_DURATION + 1), '-i', heroImagePath];
  if (hasMusic) inputs.push('-stream_loop', '-1', '-i', MUSIC_BED_PATH);

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '21',
    '-profile:v', 'high',
    '-level:v', '4.1',
    '-g', String(FPS * 2),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-t', TOTAL_DURATION.toFixed(3),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  console.log(`🎬 Rendering ${TOTAL_DURATION.toFixed(1)}s pin (${NUM_SHOTS} shots, ` +
    `music=${hasMusic ? 'on' : 'off'})...`);
  try {
    execFileSync('ffmpeg', args, { stdio: 'inherit' });
  } finally {
    try { fs.unlinkSync(titleFile); } catch { /* ignore */ }
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

function heroPublicUrl(slug, heroImagePath) {
  const file = path.basename(heroImagePath);
  return `${SITE_URL}/recipes/${slug}/images/${file}`;
}

async function createVideoPin(recipe, slug, boardId, mediaId, coverImageUrl) {
  const recipeUrl   = `${SITE_URL}/recipes/${slug}/`;
  const hashtags    = generateHashtags(recipe).join(' ');
  const desc        = recipe.description || recipe.title;

  // CC BY 4.0 attribution for the bundled music bed.  Only included when the
  // music file actually exists (so silent renders don't lie about audio).
  const creditTail  = fs.existsSync(MUSIC_BED_PATH) ? ` · ${MUSIC_CREDIT}` : '';

  // Pinterest description limit is 500; reserve room for hashtags + credit.
  const reserved    = hashtags.length + creditTail.length + 4;
  const body1       = `${desc} 📌 Save & cook tonight — full recipe at the link.`;
  const trimmedBody = body1.length > 500 - reserved
    ? body1.slice(0, 500 - reserved - 1).trimEnd() + '…'
    : body1;
  const description = `${trimmedBody} ${hashtags}${creditTail}`.slice(0, 500);

  const body = {
    board_id: boardId,
    title: recipe.title.substring(0, 100),
    description,
    link: recipeUrl,
    media_source: {
      source_type: 'video_id',
      media_id: mediaId,
      cover_image_url: coverImageUrl,
      cover_image_key_frame_time: 3,
    },
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
  // IMPORTANT: never use pinterest.jpg here — it has the title baked in by
  // makePinterestImage(), which would double up with the drawtext overlay below.
  const heroImage = fs.existsSync(heroJpg) ? heroJpg : heroWebp;
  if (!fs.existsSync(heroImage)) throw new Error(`Clean hero image not found for ${slug}`);

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

  const coverImageUrl = heroPublicUrl(slug, heroImage);
  console.log('📌 Creating video pin...');
  console.log(`   cover_image_url: ${coverImageUrl}`);
  const pin = await createVideoPin(recipe, slug, boardId, media_id, coverImageUrl);

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
