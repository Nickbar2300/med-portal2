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
 
  const { access_token, resource } = body;
 
  if (!access_token || !resource) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing access_token or resource' }) };
  }
 
  const ALLOWED = ['Patient', 'Coverage', 'ExplanationOfBenefit'];
  if (!ALLOWED.includes(resource)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid resource type' }) };
  }
 
  const BASE_URL = 'https://sandbox.bluebutton.cms.gov/v2/fhir';
 
  try {
    const response = await fetch(`${BASE_URL}/${resource}/`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });
 
    const data = await response.json();
 
    return {
      statusCode: response.ok ? 200 : response.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Fetch error', message: err.message }),
    };
  }
};
