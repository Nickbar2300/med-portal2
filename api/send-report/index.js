const crypto = require('crypto');

module.exports = async function (context, req) {
  context.res = { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } };

  if (req.method === 'OPTIONS') { context.res.status = 200; context.res.body = ''; return; }
  if (req.method !== 'POST') { context.res.status = 405; context.res.body = JSON.stringify({ error: 'Method not allowed' }); return; }

  const { toEmail, patientName, dateFrom, dateTo, reportData } = req.body || {};
  if (!toEmail || !patientName || !reportData) { context.res.status = 400; context.res.body = JSON.stringify({ error: 'Missing required fields' }); return; }

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + (48 * 60 * 60 * 1000);

  const PORTAL_URL         = process.env.PORTAL_URL;
  const FROM_EMAIL         = process.env.M365_FROM_EMAIL;
  const M365_CLIENT_ID     = process.env.M365_CLIENT_ID;
  const M365_CLIENT_SECRET = process.env.M365_CLIENT_SECRET;
  const M365_TENANT_ID     = process.env.M365_TENANT_ID;

  if (!FROM_EMAIL || !M365_CLIENT_ID || !M365_CLIENT_SECRET || !M365_TENANT_ID) {
    context.res.status = 200;
    context.res.body = JSON.stringify({ success: false, fallback: true, message: 'M365 credentials not configured.', token, expires });
    return;
  }

  // Get Microsoft Graph token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: M365_CLIENT_ID, client_secret: M365_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) { context.res.status = 500; context.res.body = JSON.stringify({ error: 'M365 auth failed', details: tokenData }); return; }

  const summary = reportData.summary || {};
  const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}.card{background:white;border-radius:8px;padding:32px;max-width:600px;margin:0 auto}.header{border-bottom:3px solid #1B2A4A;padding-bottom:16px;margin-bottom:24px}.firm{font-size:13px;color:#C41E3A;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.title{font-size:22px;font-weight:700;color:#1B2A4A}.sub{color:#666;font-size:14px;margin-top:4px}.section{margin-bottom:20px}.st{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin-bottom:6px}.sb{font-size:14px;color:#333;line-height:1.6}.btn{display:inline-block;background:#1B2A4A;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-top:24px}.footer{margin-top:24px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px}</style></head><body><div class="card"><div class="header"><div class="firm">Marzzacco Niven &amp; Associates</div><div class="title">Medical Record Report</div><div class="sub">${patientName} · ${dateFrom} – ${dateTo}</div></div><div class="section"><div class="st">Summary</div><div class="sb">${summary.overview || 'See full report for details.'}</div></div>${summary.careHighlights?.length ? `<div class="section"><div class="st">Care Highlights</div><div class="sb"><ul>${summary.careHighlights.map(h => `<li>${h}</li>`).join('')}</ul></div></div>` : ''}<div class="section"><div class="st">Cost Summary</div><div class="sb">${summary.costSummary || 'See full report.'}</div></div><a href="${PORTAL_URL}/report.html?token=${token}" class="btn">View Full Report →</a><div class="footer">This link expires in 48 hours. Generated from CMS Blue Button 2.0 Medicare data. Powered by Rapid Records.</div></div></body></html>`;

  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${FROM_EMAIL}/sendMail`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
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
    context.res.status = 500; context.res.body = JSON.stringify({ error: 'Email send failed', details: errData }); return;
  }

  context.res.status = 200;
  context.res.body = JSON.stringify({ success: true, message: `Report link sent to ${toEmail}`, token, expires });
};
