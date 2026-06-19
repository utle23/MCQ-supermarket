import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8765);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-5.5';
const MAX_IMAGE_BYTES = Number(process.env.MCQ_MAX_IMAGE_BYTES || 12 * 1024 * 1024);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function loadDotEnv(file){
  if(!existsSync(file)) return;
  const text = String(requireFileSync(file) || '');
  text.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if(!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if(key && !process.env[key]) process.env[key] = val;
  });
}

function requireFileSync(file){
  return existsSync(file) ? Buffer.from(readFileSync(file)) : null;
}

function sendJson(res, status, body){
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes){
  const chunks = [];
  let total = 0;
  for await (const chunk of req){
    total += chunk.length;
    if(total > maxBytes) throw Object.assign(new Error('Request body is too large'), {status:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseVisionRequest(req, body){
  const contentType = req.headers['content-type'] || '';
  if(contentType.includes('multipart/form-data')){
    const request = new Request(`http://localhost${req.url}`, {method:'POST', headers:req.headers, body});
    const form = await request.formData();
    const image = form.get('image');
    if(!image || typeof image.arrayBuffer !== 'function') throw Object.assign(new Error('Missing image file'), {status:400});
    const bytes = Buffer.from(await image.arrayBuffer());
    const mime = image.type || 'image/jpeg';
    return {
      imageDataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
      type: String(form.get('type') || 'fridge'),
      equipment: String(form.get('equipment') || ''),
      fileName: image.name || 'temperature.jpg',
    };
  }
  const data = JSON.parse(body.toString('utf8') || '{}');
  if(!data.image && !data.imageDataUrl) throw Object.assign(new Error('Missing image'), {status:400});
  return {
    imageDataUrl: String(data.imageDataUrl || data.image),
    type: String(data.type || 'fridge'),
    equipment: String(data.equipment || ''),
    fileName: String(data.fileName || 'temperature.jpg'),
  };
}

function schema(){
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      readable: {type:'boolean'},
      temperature: {type:['number','null']},
      displayText: {type:'string'},
      unit: {type:'string', enum:['C','F','unknown']},
      confidence: {type:'number', minimum:0, maximum:100},
      candidates: {type:'array', items:{type:'number'}},
      reason: {type:'string'},
    },
    required: ['readable','temperature','displayText','unit','confidence','candidates','reason'],
  };
}

function extractOutputText(payload){
  if(payload.output_text) return payload.output_text;
  const parts = [];
  (payload.output || []).forEach(item => {
    (item.content || []).forEach(part => {
      if(part.type === 'output_text' && part.text) parts.push(part.text);
      if(part.type === 'text' && part.text) parts.push(part.text);
    });
  });
  return parts.join('\n').trim();
}

async function callOpenAIVision({imageDataUrl, type, equipment}){
  if(!OPENAI_API_KEY){
    return {error:true, fallback:true, message:'OpenAI API key is not configured on the server.'};
  }
  const prompt = [
    'You are reading a supermarket fridge/freezer temperature controller display.',
    'Extract the temperature number shown on the electronic display only.',
    'The display may be a red seven-segment LED. The decimal point can be very small, so carefully distinguish 18 from 1.8.',
    'Ignore screws, labels, brand text, buttons, dates, product labels, and any numbers not on the active temperature display.',
    `Equipment: ${equipment || 'unknown'}. Expected type: ${type || 'fridge'}.`,
    'Use Celsius by default for supermarket fridge/freezer controllers when the unit is not visible.',
    'Return readable=true whenever a temperature number is visually readable, even if the photo has glare, shadows, blur, or surrounding objects.',
    'Return readable=false only when no temperature number can be read from the display.',
    'Return JSON only.',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      input: [{
        role: 'user',
        content: [
          {type:'input_text', text:prompt},
          {type:'input_image', image_url:imageDataUrl, detail:'high'},
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'temperature_reading',
          strict: true,
          schema: schema(),
        },
      },
      max_output_tokens: 300,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if(!response.ok){
    return {
      error: true,
      message: payload.error?.message || `OpenAI Vision request failed (${response.status})`,
      status: response.status,
      source: 'OpenAI Vision',
    };
  }

  let parsed = payload;
  const text = extractOutputText(payload);
  if(text){
    try{ parsed = JSON.parse(text); }
    catch{ parsed = payload; }
  }

  const value = Number(parsed.temperature);
  if(parsed.readable && Number.isFinite(value)){
    return {
      temperature: value,
      value,
      tempC: parsed.unit === 'F' ? (value - 32) * 5 / 9 : value,
      confidence: Number(parsed.confidence || 0),
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates.filter(n => Number.isFinite(Number(n))).map(Number) : [value],
      text: parsed.displayText || String(value),
      rawText: text || JSON.stringify(parsed),
      source: `OpenAI Vision (${VISION_MODEL})`,
      reason: parsed.reason || '',
    };
  }
  return {
    error: true,
    readable: false,
    message: parsed.reason || 'AI Vision could not read a temperature number from the display. Retake a closer photo.',
    text: parsed.displayText || '',
    confidence: Number(parsed.confidence || 0),
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    source: `OpenAI Vision (${VISION_MODEL})`,
  };
}

async function handleVision(req, res){
  try{
    const body = await readBody(req, MAX_IMAGE_BYTES);
    const input = await parseVisionRequest(req, body);
    const result = await callOpenAIVision(input);
    sendJson(res, result.error ? (result.fallback ? 503 : 422) : 200, result);
  }catch(err){
    sendJson(res, err.status || 500, {error:true, message:err.message || 'Vision endpoint failed'});
  }
}

async function serveStatic(req, res){
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if(pathname === '/') pathname = '/index.html';
  const target = path.normalize(path.join(__dirname, pathname));
  if(!target.startsWith(__dirname)){
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try{
    await fs.access(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    createReadStream(target).pipe(res);
  }catch{
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  if(req.method === 'POST' && req.url?.startsWith('/api/vision/temperature')) return void handleVision(req, res);
  if(req.method === 'GET' && req.url?.startsWith('/api/health')) return void sendJson(res, 200, {ok:true, aiVision:!!OPENAI_API_KEY, model:VISION_MODEL});
  if(req.method === 'GET' || req.method === 'HEAD') return void serveStatic(req, res);
  res.writeHead(405, {'Allow':'GET, POST'});
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`MCQ Ops Hub running at http://localhost:${PORT}/`);
  console.log(OPENAI_API_KEY ? `AI Vision endpoint enabled with ${VISION_MODEL}` : 'AI Vision endpoint disabled: set OPENAI_API_KEY in .env or environment.');
});
