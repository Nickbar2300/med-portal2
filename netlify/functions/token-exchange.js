exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
 
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
 
  const { code, code_verifier, redirect_uri } = body;
 
  if (!code || !code_verifier || !redirect_uri) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameters' }) };
  }
 
  const CLIENT_ID     = process.env.BB2_CLIENT_ID;
  const CLIENT_SECRET = process.env.BB2_CLIENT_SECRET;
  const TOKEN_URL     = 'https://sandbox.bluebutton.cms.gov/v2/o/token/';
 
  const params = new URLSearchParams({
    grant_type:    'authorization_code',
    code:          code,
    redirect_uri:  redirect_uri,
    code_verifier: code_verifier,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
 
  try {
    const response = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Token exchange failed', details: data }),
      };
    }
 
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server error', message: err.message }),
    };
  }
};
