// list-gemini-models.js
// Run: GEMINI_API_KEY=your_key node list-gemini-models.js
const https = require('https');
const key = process.env.GEMINI_API_KEY;
const req = https.request({ hostname: 'generativelanguage.googleapis.com', path: `/v1beta/models?key=${key}&pageSize=100`, method: 'GET' }, (res) => {
  let chunks = '';
  res.on('data', d => chunks += d);
  res.on('end', () => {
    const data = JSON.parse(chunks);
    const imageModels = (data.models || []).filter(m => 
      m.name.includes('imagen') || m.name.includes('flash') || m.name.includes('image')
    );
    console.log('Image-capable models on your account:');
    imageModels.forEach(m => console.log(' -', m.name, '|', m.supportedGenerationMethods?.join(', ')));
  });
});
req.on('error', e => console.error(e));
req.end();
