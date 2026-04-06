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

exports.handler = async function (event) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

    let body;
    try { body = JSON.parse(event.body); }
    catch(e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { toPhone, patientName, caseRef, signingToken } = body || {};
    if (!toPhone) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'toPhone required' }) };

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER || '+17177561092';
    const portalUrl  = process.env.PORTAL_URL || 'https://glowing-pavlova-dea557.netlify.app';

    if (!accountSid || !authToken) return { statusCode: 200, headers: cors, body: JSON.stringify({ success: false, message: 'Twilio not configured' }) };

    const token = signingToken || Math.random().toString(36).substring(2) + Date.now().toString(36);
    const signingUrl = `${portalUrl}/sign.html?token=${token}&name=${encodeURIComponent(patientName||'')}&ref=${encodeURIComponent(caseRef||'')}`;
    let phone = toPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = '1' + phone;
    if (!phone.startsWith('+')) phone = '+' + phone;

    const msgBody = `Marzzacco Niven & Associates${caseRef ? ` (Ref: ${caseRef})` : ''} has requested your HIPAA authorization.\n\nSign here: ${signingUrl}\n\nExpires in 48 hours. Reply STOP to opt out.`;
    const formBody = querystring.stringify({ To: phone, From: fromNumber, Body: msgBody });
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    try {
        const result = await httpsPost('api.twilio.com', `/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(formBody)
        }, formBody);
        const data = JSON.parse(result.body);
        if (result.status === 201 && data.sid) {
            return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, messageSid: data.sid, to: phone, signingUrl, token }) };
        }
        return { statusCode: 200, headers: cors, body: JSON.stringify({ success: false, error: data.message || 'Twilio failed', details: data }) };
    } catch(err) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
    }
};
