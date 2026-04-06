const https = require('https');

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
  if (req.method === 'OPTIONS') { context.res = { status: 200, headers, body: '' }; return; }
  if (req.method !== 'POST') { context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }; return; }

  let parsed;
  try { parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch(e) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; return; }

  const { patient, coverage, claims, dateFrom, dateTo } = parsed || {};
  if (!patient || !claims) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing data' }) }; return; }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const claimsText = claims.map((c, i) => `${i+1}. Date: ${c.date||'N/A'} | Type: ${c.serviceType} | Provider: ${c.provider} | Billed: $${c.total??'N/A'} | Paid: $${c.paid??'N/A'} | Dx: ${c.diagnoses?.join(', ')||'None'}`).join('\n');
  const covText = (coverage||[]).map(c => `${c.part}: ${c.status}`).join(', ');
  const prompt = `You are a medical records specialist. Generate a professional summary of Medicare claims for ${dateFrom} to ${dateTo}.\nPATIENT: ${patient.name}, DOB: ${patient.dob}, Gender: ${patient.gender}, Coverage: ${covText}\nCLAIMS (${claims.length}):\n${claimsText}\nReturn ONLY valid JSON:\n{"overview":"2-3 sentence summary","careHighlights":["bullet1","bullet2","bullet3"],"providersAndServices":"paragraph","costSummary":"paragraph","diagnoses":"paragraph","recommendations":"1-2 sentences","totalClaims":${claims.length},"dateRange":"${dateFrom} – ${dateTo}"}`;
  const requestBody = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] });

  try {
    const result = await httpsPost('api.anthropic.com', '/v1/messages', {
      'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(requestBody)
    }, requestBody);
    const data = JSON.parse(result.body);
    if (result.status !== 200) { context.res = { status: result.status, headers, body: JSON.stringify({ error: 'Claude error', details: data }) }; return; }
    const text = data.content?.[0]?.text || '{}';
    let summary;
    try { summary = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { summary = { overview: text, careHighlights: [], providersAndServices: '', costSummary: '', diagnoses: '', recommendations: '' }; }
    context.res = { status: 200, headers, body: JSON.stringify(summary) };
  } catch(err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
