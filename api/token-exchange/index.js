const https = require('https');
const querystring = require('querystring');
 
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
 
module.exports = async function (context, req) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
 
  if (req.method === 'OPTIONS') {
    context.res = { status: 200, headers, body: '' }; return;
  }
  if (req.method !== 'POST') {
    context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }; return;
  }
 
  // Parse body safely - Azure sometimes passes it as string, sometimes object
  let parsed;
  try {
    parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch(e) {
    context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; return;
  }
 
  const { code, code_verifier, redirect_uri } = parsed || {};
 
  if (!code || !code_verifier || !redirect_uri) {
    context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing parameters', got: { code: !!code, cv: !!code_verifier, ru: !!redirect_uri } }) }; return;
  }
 
  const CLIENT_ID     = process.env.BB2_CLIENT_ID;
  const CLIENT_SECRET = process.env.BB2_CLIENT_SECRET;
 
  if (!CLIENT_ID || !CLIENT_SECRET) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: 'BB2 credentials not configured in Azure environment variables' }) }; return;
  }
 
  const formBody = querystring.stringify({
    grant_type: 'authorization_code',
    code, redirect_uri, code_verifier,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
 
  try {
    const result = await httpsPost(
      'sandbox.bluebutton.cms.gov',
      '/v2/o/token/',
      { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(formBody) },
      formBody
    );
 
    context.log('BB2 status:', result.status, '| body preview:', result.body.substring(0, 100));
 
    let data;
    try { data = JSON.parse(result.body); }
    catch(e) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Non-JSON from BB2', raw: result.body.substring(0, 300) }) }; return; }
 
    context.res = { status: result.status, headers, body: JSON.stringify(data) };
 
  } catch (err) {
    context.log.error('token-exchange error:', err.message);
    context.res = { status: 500, headers, body: JSON.stringify({ error: 'Server error', message: err.message }) };
  }
};
