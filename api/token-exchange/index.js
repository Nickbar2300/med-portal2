module.exports = async function (context, req) {
  context.res = { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } };

  if (req.method === 'OPTIONS') { context.res.status = 200; context.res.body = ''; return; }
  if (req.method !== 'POST') { context.res.status = 405; context.res.body = JSON.stringify({ error: 'Method not allowed' }); return; }

  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code || !code_verifier || !redirect_uri) {
    context.res.status = 400; context.res.body = JSON.stringify({ error: 'Missing required parameters' }); return;
  }

  const CLIENT_ID     = process.env.BB2_CLIENT_ID;
  const CLIENT_SECRET = process.env.BB2_CLIENT_SECRET;
  const TOKEN_URL     = 'https://sandbox.bluebutton.cms.gov/v2/o/token/';

  const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, code_verifier, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });

  try {
    const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await response.json();
    context.res.status = response.ok ? 200 : response.status;
    context.res.body = JSON.stringify(data);
  } catch (err) {
    context.res.status = 500; context.res.body = JSON.stringify({ error: 'Server error', message: err.message });
  }
};
