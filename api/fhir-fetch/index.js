module.exports = async function (context, req) {
  context.res = { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } };

  if (req.method === 'OPTIONS') { context.res.status = 200; context.res.body = ''; return; }
  if (req.method !== 'POST') { context.res.status = 405; context.res.body = JSON.stringify({ error: 'Method not allowed' }); return; }

  const { access_token, resource, url } = req.body || {};
  if (!access_token) { context.res.status = 400; context.res.body = JSON.stringify({ error: 'Missing access_token' }); return; }

  const ALLOWED = ['Patient', 'Coverage', 'ExplanationOfBenefit'];
  const BASE_URL = 'https://sandbox.bluebutton.cms.gov/v2/fhir';

  let fetchUrl;
  if (url) {
    if (!url.startsWith('https://sandbox.bluebutton.cms.gov')) { context.res.status = 400; context.res.body = JSON.stringify({ error: 'Invalid URL' }); return; }
    fetchUrl = url;
  } else if (resource && ALLOWED.includes(resource)) {
    const count = resource === 'ExplanationOfBenefit' ? '?_count=50' : '';
    fetchUrl = `${BASE_URL}/${resource}/${count}`;
  } else {
    context.res.status = 400; context.res.body = JSON.stringify({ error: 'Invalid resource type' }); return;
  }

  try {
    const response = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } });
    const data = await response.json();
    context.res.status = response.ok ? 200 : response.status;
    context.res.body = JSON.stringify(data);
  } catch (err) {
    context.res.status = 500; context.res.body = JSON.stringify({ error: 'Fetch error', message: err.message });
  }
};
