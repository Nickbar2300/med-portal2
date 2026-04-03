const { app } = require('@azure/functions');
const https = require('https');

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

app.http('fhir-fetch', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return { status: 200, headers: corsHeaders, body: '' };

    let parsed;
    try { const text = await request.text(); parsed = JSON.parse(text); }
    catch(e) { return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { access_token, resource, url } = parsed || {};
    if (!access_token) return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing access_token' }) };

    const ALLOWED = ['Patient', 'Coverage', 'ExplanationOfBenefit'];
    const BASE_URL = 'https://sandbox.bluebutton.cms.gov/v2/fhir';
    let fetchUrl;

    if (url) {
      if (!url.startsWith('https://sandbox.bluebutton.cms.gov')) return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid URL' }) };
      fetchUrl = url;
    } else if (resource && ALLOWED.includes(resource)) {
      fetchUrl = `${BASE_URL}/${resource}/${resource === 'ExplanationOfBenefit' ? '?_count=50' : ''}`;
    } else {
      return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid resource' }) };
    }

    try {
      const result = await httpsGet(fetchUrl, { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' });
      const data = JSON.parse(result.body);
      return { status: result.status, headers: corsHeaders, body: JSON.stringify(data) };
    } catch(err) {
      return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }
});
