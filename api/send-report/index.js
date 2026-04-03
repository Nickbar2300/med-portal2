const { app } = require('@azure/functions');
const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');

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

app.http('send-report', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return { status: 200, headers: corsHeaders, body: '' };

    let parsed;
    try { const text = await request.text(); parsed = JSON.parse(text); }
    catch(e) { return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { toEmail, patientName, dateFrom, dateTo, reportData } = parsed || {};
    if (!toEmail || !patientName || !reportData) return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing fields' }) };

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (48 * 60 * 60 * 1000);
    const PORTAL_URL = process.env.PORTAL_URL || 'https://lively-sky-0ab08b310.1.azurestaticapps.net';
    const FROM_EMAIL = process.env.M365_FROM_EMAIL;
    const M365_CLIENT_ID = process.env.M365_CLIENT_ID;
    const M365_CLIENT_SECRET = process.env.M365_CLIENT_SECRET;
    const M365_TENANT_ID = process.env.M365_TENANT_ID;

    if (!FROM_EMAIL || !M365_CLIENT_ID || !M365_CLIENT_SECRET || !M365_TENANT_ID) {
      return { status: 200, headers: corsHeaders, body: JSON.stringify({ success: false, fallback: true, message: 'M365 not configured', token, expires }) };
    }

    const tokenBody = querystring.stringify({ grant_type: 'client_credentials', client_id: M365_CLIENT_ID, client_secret: M365_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' });
    const tokenResult = await httpsPost('login.microsoftonline.com', `/${M365_TENANT_ID}/oauth2/v2.0/token`, { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) }, tokenBody);
    const tokenData = JSON.parse(tokenResult.body);
    if (!tokenData.access_token) return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: 'M365 auth failed' }) };

    const summary = reportData.summary || {};
    const emailHtml = `<html><body style="font-family:Arial,sans-serif;padding:20px"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;padding:32px"><div style="border-bottom:3px solid #1B2A4A;padding-bottom:16px;margin-bottom:24px"><div style="color:#C41E3A;font-weight:600;font-size:13px">MARZZACCO NIVEN & ASSOCIATES</div><div style="font-size:22px;font-weight:700;color:#1B2A4A">Medical Record Report</div><div style="color:#666">${patientName} · ${dateFrom} – ${dateTo}</div></div><p>${summary.overview||'See full report.'}</p><a href="${PORTAL_URL}/report.html?token=${token}" style="display:inline-block;background:#1B2A4A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:24px">View Full Report →</a><p style="margin-top:24px;font-size:12px;color:#999">Link expires in 48 hours. Powered by Rapid Records.</p></div></body></html>`;
    const emailPayload = JSON.stringify({ message: { subject: `Medical Record Report — ${patientName}`, body: { contentType: 'HTML', content: emailHtml }, toRecipients: [{ emailAddress: { address: toEmail } }] }, saveToSentItems: true });

    const sendResult = await httpsPost('graph.microsoft.com', `/v1.0/users/${FROM_EMAIL}/sendMail`, { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(emailPayload) }, emailPayload);
    if (sendResult.status === 202) return { status: 200, headers: corsHeaders, body: JSON.stringify({ success: true, token, expires }) };
    return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Email failed' }) };
  }
});
