module.exports = async function (context, req) {
  context.res = { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } };

  if (req.method === 'OPTIONS') { context.res.status = 200; context.res.body = ''; return; }
  if (req.method !== 'POST') { context.res.status = 405; context.res.body = JSON.stringify({ error: 'Method not allowed' }); return; }

  const { toPhone, patientName, caseRef, signingToken } = req.body || {};
  if (!toPhone) { context.res.status = 400; context.res.body = JSON.stringify({ error: 'toPhone is required' }); return; }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+17177561092';
  const portalUrl  = process.env.PORTAL_URL;

  if (!accountSid || !authToken) {
    context.res.status = 200;
    context.res.body = JSON.stringify({ success: false, fallback: true, message: 'Twilio credentials not configured in Azure App Settings.' });
    return;
  }

  const token = signingToken || Math.random().toString(36).substring(2) + Date.now().toString(36);
  const signingUrl = `${portalUrl}/sign.html?token=${token}`;

  let phone = toPhone.replace(/\D/g, '');
  if (phone.length === 10) phone = '1' + phone;
  if (!phone.startsWith('+')) phone = '+' + phone;

  const nameStr = patientName ? `, ${patientName.split(' ')[0]}` : '';
  const caseStr = caseRef ? ` (Ref: ${caseRef})` : '';
  const messageBody =
    `Marzzacco Niven & Associates${caseStr} has requested your HIPAA authorization for medical records. ` +
    `Please review and sign here:\n\n${signingUrl}\n\nThis link expires in 48 hours. Reply STOP to opt out.`;

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append('To',   phone);
    params.append('From', fromNumber);
    params.append('Body', messageBody);

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const result = await response.json();
    if (response.ok && result.sid) {
      context.res.status = 200;
      context.res.body = JSON.stringify({ success: true, messageSid: result.sid, to: phone, signingUrl, token });
    } else {
      context.res.status = 200;
      context.res.body = JSON.stringify({ success: false, error: result.message || result.code || 'Twilio send failed', details: result });
    }
  } catch (err) {
    context.res.status = 500;
    context.res.body = JSON.stringify({ success: false, error: err.message });
  }
};
