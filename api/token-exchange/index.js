const { app } = require('@azure/functions');
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

app.http('token-exchange', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return { status: 200, headers: corsHeaders, body: '' };

    let parsed;
    try {
      const text = await request.text();
      parsed = JSON.parse(text);
    } catch(e) {
      return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const { code, code_verifier, redirect_uri } = parsed || {};
    if (!code || !code_verifier || !redirect_uri) {
      return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing parameters' }) };
    }

    const CLIENT_ID     = process.env.BB2_CLIENT_ID;
    const CLIENT_SECRET = process.env.BB2_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: 'BB2 credentials not configured' }) };
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
      context.log('BB2 status:', result.status);
      let data;
      try { data = JSON.parse(result.body); }
      catch(e) { return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Non-JSON from BB2', raw: result.body.substring(0,200) }) }; }
      return { status: result.status, headers: corsHeaders, body: JSON.stringify(data) };
    } catch(err) {
      return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }
});
