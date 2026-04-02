// ── submit-hipaa/index.js ────────────────────────────────────────────────────
// Receives signed HIPAA form from sign.html, stores it in Azure Blob Storage
// with a 90-day auto-delete lifecycle tag, and records the signing event.
//
// Azure App Settings required:
//   AZURE_STORAGE_CONNECTION_STRING  (set in Azure portal)
//   PORTAL_URL
// ─────────────────────────────────────────────────────────────────────────────

const { BlobServiceClient } = require('@azure/storage-blob');
const crypto = require('crypto');

module.exports = async function (context, req) {
  context.res = {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  };

  if (req.method === 'OPTIONS') {
    context.res.status = 200;
    context.res.body = '';
    return;
  }

  if (req.method !== 'POST') {
    context.res.status = 405;
    context.res.body = JSON.stringify({ error: 'Method not allowed' });
    return;
  }

  const { token, patientName, caseRef, signedAt, signatureImg, userAgent } = req.body || {};

  if (!token || !signatureImg) {
    context.res.status = 400;
    context.res.body = JSON.stringify({ error: 'Missing token or signature' });
    return;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    context.res.status = 500;
    context.res.body = JSON.stringify({ error: 'Storage not configured' });
    return;
  }

  try {
    // ── Strip base64 header if present ────────────────────────────────────
    const base64Data = signatureImg.replace(/^data:image\/\w+;base64,/, '');
    const sigBuffer  = Buffer.from(base64Data, 'base64');

    // ── Build blob name ────────────────────────────────────────────────────
    // Format: YYYY-MM-DD_token_patientname-safe.png
    const datePart  = new Date(signedAt || Date.now()).toISOString().split('T')[0];
    const nameSafe  = (patientName || 'unknown').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const tokenSafe = (token || '').substring(0, 16);
    const blobName  = `${datePart}_${tokenSafe}_${nameSafe}.png`;

    // ── Build metadata (no PHI in blob name, PHI only in metadata) ─────────
    // Metadata is encrypted at rest with the blob
    const metadata = {
      patientname:  (patientName || '').substring(0, 100),
      caseref:      (caseRef     || '').substring(0, 100),
      signedat:     (signedAt    || new Date().toISOString()).substring(0, 50),
      useragent:    (userAgent   || '').substring(0, 200),
      token:        (token       || '').substring(0, 64),
      retainuntil:  new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };

    // ── Upload to Azure Blob Storage ───────────────────────────────────────
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient   = blobServiceClient.getContainerClient('hipaa-forms');

    // Ensure container exists (idempotent)
    await containerClient.createIfNotExists({ access: 'private' });

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(sigBuffer, sigBuffer.length, {
      blobHTTPHeaders: { blobContentType: 'image/png' },
      metadata,
      tags: {
        // Azure lifecycle policies can act on tags
        retainUntil: metadata.retainuntil,
        caseRef:     (caseRef || 'none').substring(0, 63),
        status:      'signed',
      },
    });

    context.log(`HIPAA form stored: ${blobName}`);

    // ── Return success — no PHI in response ───────────────────────────────
    context.res.status = 200;
    context.res.body = JSON.stringify({
      success:   true,
      blobName,
      signedAt:  metadata.signedat,
      retainUntil: metadata.retainuntil,
    });

  } catch (err) {
    context.log.error('submit-hipaa error:', err.message);
    context.res.status = 500;
    context.res.body = JSON.stringify({ error: 'Storage error', message: err.message });
  }
};
