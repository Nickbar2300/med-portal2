const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
module.exports = async function (context, req) {
  context.res = { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } };

  if (req.method === 'OPTIONS') { context.res.status = 200; context.res.body = ''; return; }
  if (req.method !== 'POST') { context.res.status = 405; context.res.body = JSON.stringify({ error: 'Method not allowed' }); return; }

  const { patient, coverage, claims, dateFrom, dateTo } = req.body || {};
  if (!patient || !claims) { context.res.status = 400; context.res.body = JSON.stringify({ error: 'Missing patient or claims data' }); return; }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const claimsText = claims.map((c, i) =>
    `${i + 1}. Date: ${c.date || 'N/A'} | Type: ${c.serviceType} | Provider: ${c.provider} | Billed: $${c.total ?? 'N/A'} | Paid: $${c.paid ?? 'N/A'} | Dx: ${c.diagnoses?.join(', ') || 'None'}`
  ).join('\n');

  const covText = coverage.map(c => `${c.part}: ${c.status}`).join(', ');

  const prompt = `You are a medical records specialist generating a professional one-page summary of a patient's Medicare claims history for the period ${dateFrom} to ${dateTo}.

PATIENT INFORMATION:
Name: ${patient.name}
Date of Birth: ${patient.dob}
Gender: ${patient.gender}
Medicare Coverage: ${covText}

CLAIMS DATA (${claims.length} claims):
${claimsText}

Generate a professional medical record summary. Be concise, accurate, and written in clear language suitable for both medical professionals and patients. Do NOT invent or infer information not present in the data.

Format your response as JSON with these exact keys:
{
  "overview": "2-3 sentence summary of the patient's care during this period",
  "careHighlights": ["bullet 1", "bullet 2", "bullet 3"],
  "providersAndServices": "paragraph describing providers seen and service types",
  "costSummary": "paragraph summarizing total billed, paid, and any notable cost patterns",
  "diagnoses": "paragraph summarizing the diagnosis codes and what conditions were being treated",
  "recommendations": "1-2 sentences noting anything the records administrator should be aware of",
  "totalClaims": ${claims.length},
  "dateRange": "${dateFrom} – ${dateTo}"
}

Return ONLY valid JSON, no markdown, no preamble.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    });

    const data = await response.json();
    if (!response.ok) { context.res.status = response.status; context.res.body = JSON.stringify({ error: 'Claude API error', details: data }); return; }

    const text = data.content?.[0]?.text || '{}';
    let summary;
    try { summary = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { summary = { overview: text, careHighlights: [], providersAndServices: '', costSummary: '', diagnoses: '', recommendations: '' }; }

    context.res.status = 200;
    context.res.body = JSON.stringify(summary);
  } catch (err) {
    context.res.status = 500; context.res.body = JSON.stringify({ error: err.message });
  }
};
