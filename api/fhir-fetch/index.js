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

module.exports = async function (context, req) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { context.res = { status: 200, headers, body: '' }; return; }
  if (req.method !== 'POST') { context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }; return; }

  let parsed;
  try { parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch(e) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; return; }

  const { access_token, resource, url } = parsed || {};
  if (!access_token) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing access_token' }) }; return; }

  const ALLOWED = ['Patient', 'Coverage', 'ExplanationOfBenefit'];
  const BASE_URL = 'https://sandbox.bluebutton.cms.gov/v2/fhir';
  let fetchUrl;

  if (url) {
    if (!url.startsWith('https://sandbox.bluebutton.cms.gov')) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid URL' }) }; return; }
    fetchUrl = url;
  } else if (resource && ALLOWED.includes(resource)) {
    fetchUrl = `${BASE_URL}/${resource}/${resource === 'ExplanationOfBenefit' ? '?_count=50' : ''}`;
  } else {
    context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid resource' }) }; return;
  }

  try {
    const result = await httpsGet(fetchUrl, { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' });
    const data = JSON.parse(result.body);
    context.res = { status: result.status, headers, body: JSON.stringify(data) };
  } catch(err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
