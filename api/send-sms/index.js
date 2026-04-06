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

module.exports = async function (context, req) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { context.res = { status: 200, headers, body: '' }; return; }
  if (req.method !== 'POST') { context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }; return; }

  let parsed;
  try { parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch(e) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; return; }

  const { toPhone, patientName, caseRef, signingToken } = parsed || {};
  if (!toPhone) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'toPhone required' }) }; return; }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+17177561092';
  const portalUrl  = process.env.PORTAL_URL || 'https://lively-sky-0ab08b310.1.azurestaticapps.net';

  if (!accountSid || !authToken) { context.res = { status: 200, headers, body: JSON.stringify({ success: false, fallback: true }) }; return; }

  const token = signingToken || Math.random().toString(36).substring(2) + Date.now().toString(36);
  const signingUrl = `${portalUrl}/sign.html?token=${token}&name=${encodeURIComponent(patientName||'')}&ref=${encodeURIComponent(caseRef||'')}`;
  let phone = toPhone.replace(/\D/g, '');
  if (phone.length === 10) phone = '1' + phone;
  if (!phone.startsWith('+')) phone = '+' + phone;

  const messageBody = `Marzzacco Niven & Associates${caseRef ? ` (Ref: ${caseRef})` : ''} has requested your HIPAA authorization.\n\nSign here: ${signingUrl}\n\nExpires in 48 hours. Reply STOP to opt out.`;
  const formBody = querystring.stringify({ To: phone, From: fromNumber, Body: messageBody });
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const result = await httpsPost('api.twilio.com', `/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(formBody)
    }, formBody);
    const data = JSON.parse(result.body);
    if (result.status === 201 && data.sid) {
      context.res = { status: 200, headers, body: JSON.stringify({ success: true, messageSid: data.sid, to: phone, signingUrl, token }) };
    } else {
      context.res = { status: 200, headers, body: JSON.stringify({ success: false, error: data.message || 'Twilio failed', details: data }) };
    }
  } catch(err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
