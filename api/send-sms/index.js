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

app.http('send-sms', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return { status: 200, headers: corsHeaders, body: '' };

    let parsed;
    try { const text = await request.text(); parsed = JSON.parse(text); }
    catch(e) { return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { toPhone, patientName, caseRef, signingToken } = parsed || {};
    if (!toPhone) return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'toPhone required' }) };

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER || '+17177561092';
    const portalUrl  = process.env.PORTAL_URL || 'https://lively-sky-0ab08b310.1.azurestaticapps.net';

    if (!accountSid || !authToken) return { status: 200, headers: corsHeaders, body: JSON.stringify({ success: false, fallback: true, message: 'Twilio not configured' }) };

    const token = signingToken || Math.random().toString(36).substring(2) + Date.now().toString(36);
    const signingUrl = `${portalUrl}/sign.html?token=${token}&name=${encodeURIComponent(patientName||'')}&ref=${encodeURIComponent(caseRef||'')}`;

    let phone = toPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = '1' + phone;
    if (!phone.startsWith('+')) phone = '+' + phone;

    const caseStr = caseRef ? ` (Ref: ${caseRef})` : '';
    const messageBody = `Marzzacco Niven & Associates${caseStr} has requested your HIPAA authorization. Please sign here:\n\n${signingUrl}\n\nLink expires in 48 hours. Reply STOP to opt out.`;
    const formBody = querystring.stringify({ To: phone, From: fromNumber, Body: messageBody });
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    try {
      const result = await httpsPost('api.twilio.com', `/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody)
      }, formBody);

      const data = JSON.parse(result.body);
      if (result.status === 201 && data.sid) {
        return { status: 200, headers: corsHeaders, body: JSON.stringify({ success: true, messageSid: data.sid, to: phone, signingUrl, token }) };
      }
      return { status: 200, headers: corsHeaders, body: JSON.stringify({ success: false, error: data.message || 'Twilio failed', details: data }) };
    } catch(err) {
      return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }
});
