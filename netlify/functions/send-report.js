const https = require('https');
const crypto = require('crypto');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { toEmail, patientName, dateFrom, dateTo, reportData } = body;
  if (!toEmail || !patientName || !reportData) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // Generate a secure token for the report link
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + (48 * 60 * 60 * 1000); // 48 hours

  // Store report data in Netlify Blobs via environment
  // For now we embed a summary in the email and note the token
  const PORTAL_URL  = process.env.PORTAL_URL || 'https://glowing-pavlova-dea557.netlify.app';
  const FROM_EMAIL  = process.env.M365_FROM_EMAIL;
  const M365_CLIENT_ID     = process.env.M365_CLIENT_ID;
  const M365_CLIENT_SECRET = process.env.M365_CLIENT_SECRET;
  const M365_TENANT_ID     = process.env.M365_TENANT_ID;

  if (!FROM_EMAIL || !M365_CLIENT_ID || !M365_CLIENT_SECRET || !M365_TENANT_ID) {
    // Fallback: return the token so the portal can show a copyable link
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        fallback: true,
        message: 'M365 credentials not configured. Use the download option or configure Microsoft 365 environment variables.',
        token,
        expires,
      }),
    };
  }

  // Get Microsoft Graph OAuth token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     M365_CLIENT_ID,
      client_secret: M365_CLIENT_SECRET,
      scope:         'https://graph.microsoft.com/.default',
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'M365 auth failed', details: tokenData }) };
  }

  const accessToken = tokenData.access_token;

  // Build email HTML
  const summary = reportData.summary || {};
  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 8px; padding: 32px; max-width: 600px; margin: 0 auto; }
  .header { border-bottom: 2px solid #1f6feb; padding-bottom: 16px; margin-bottom: 24px; }
  .title { font-size: 22px; font-weight: 600; color: #0d1117; }
  .sub { color: #666; font-size: 14px; margin-top: 4px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 6px; }
  .section-body { font-size: 14px; color: #333; line-height: 1.6; }
  .btn { display: inline-block; background: #1f6feb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin-top: 24px; }
  .footer { margin-top: 24px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="title">Medical Record Report</div>
    <div class="sub">${patientName} · ${dateFrom} – ${dateTo}</div>
  </div>
  <div class="section">
    <div class="section-title">Summary</div>
    <div class="section-body">${summary.overview || 'See full report for details.'}</div>
  </div>
  ${summary.careHighlights?.length ? `
  <div class="section">
    <div class="section-title">Care Highlights</div>
    <div class="section-body"><ul>${summary.careHighlights.map(h => `<li>${h}</li>`).join('')}</ul></div>
  </div>` : ''}
  <div class="section">
    <div class="section-title">Cost Summary</div>
    <div class="section-body">${summary.costSummary || 'See full report.'}</div>
  </div>
  <a href="${PORTAL_URL}/report.html?token=${token}" class="btn">View Full Report →</a>
  <div class="footer">
    This link expires in 48 hours. This report was generated from CMS Blue Button 2.0 Medicare data.
    If you did not request this report, please disregard this email.
  </div>
</div>
</body>
</html>`;

  // Send via Microsoft Graph API
  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${FROM_EMAIL}/sendMail`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: `Medical Record Report — ${patientName} (${dateFrom} to ${dateTo})`,
        body: { contentType: 'HTML', content: emailHtml },
        toRecipients: [{ emailAddress: { address: toEmail } }],
        from: { emailAddress: { address: FROM_EMAIL } },
      },
      saveToSentItems: true,
    }),
  });

  if (!sendRes.ok) {
    const errData = await sendRes.json().catch(() => ({}));
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Email send failed', details: errData }) };
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, message: `Report link sent to ${toEmail}`, token, expires }),
  };
};
