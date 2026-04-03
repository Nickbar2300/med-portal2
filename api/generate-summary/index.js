const { app } = require('@azure/functions');
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

app.http('generate-summary', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return { status: 200, headers: corsHeaders, body: '' };

    let parsed;
    try { const text = await request.text(); parsed = JSON.parse(text); }
    catch(e) { return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { patient, coverage, claims, dateFrom, dateTo } = parsed || {};
    if (!patient || !claims) return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing data' }) };

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const claimsText = claims.map((c, i) => `${i+1}. Date: ${c.date||'N/A'} | Type: ${c.serviceType} | Provider: ${c.provider} | Billed: $${c.total??'N/A'} | Paid: $${c.paid??'N/A'} | Dx: ${c.diagnoses?.join(', ')||'None'}`).join('\n');
    const covText = (coverage||[]).map(c => `${c.part}: ${c.status}`).join(', ');

    const prompt = `You are a medical records specialist. Generate a professional summary of Medicare claims for ${dateFrom} to ${dateTo}.
PATIENT: ${patient.name}, DOB: ${patient.dob}, Gender: ${patient.gender}, Coverage: ${covText}
CLAIMS (${claims.length}):
${claimsText}
Return ONLY valid JSON:
{"overview":"2-3 sentence summary","careHighlights":["bullet1","bullet2","bullet3"],"providersAndServices":"paragraph","costSummary":"paragraph","diagnoses":"paragraph","recommendations":"1-2 sentences","totalClaims":${claims.length},"dateRange":"${dateFrom} – ${dateTo}"}`;

    const requestBody = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] });

    try {
      const result = await httpsPost('api.anthropic.com', '/v1/messages', {
        'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(requestBody)
      }, requestBody);

      const data = JSON.parse(result.body);
      if (result.status !== 200) return { status: result.status, headers: corsHeaders, body: JSON.stringify({ error: 'Claude error', details: data }) };

      const text = data.content?.[0]?.text || '{}';
      let summary;
      try { summary = JSON.parse(text.replace(/```json|```/g, '').trim()); }
      catch { summary = { overview: text, careHighlights: [], providersAndServices: '', costSummary: '', diagnoses: '', recommendations: '' }; }
      return { status: 200, headers: corsHeaders, body: JSON.stringify(summary) };
    } catch(err) {
      return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }
});
