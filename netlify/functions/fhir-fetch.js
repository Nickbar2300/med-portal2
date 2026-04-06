const https = require('https');

function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
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

    const { access_token, resource, url, dateFrom, dateTo } = body || {};
    if (!access_token) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing access_token' }) };

    const ALLOWED = ['Patient', 'Coverage', 'ExplanationOfBenefit'];
    const BASE = 'https://sandbox.bluebutton.cms.gov/v2/fhir';
    let fetchUrl;

    if (url) {
        if (!url.startsWith('https://sandbox.bluebutton.cms.gov')) {
            return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid URL' }) };
        }
        fetchUrl = url;
    } else if (resource && ALLOWED.includes(resource)) {
        if (resource === 'ExplanationOfBenefit') {
            // Build URL with date filters
            const params = new URLSearchParams({ _count: '50' });
            if (dateFrom) params.set('service-date', `ge${dateFrom}`);
            if (dateTo)   params.set('service-date', `le${dateTo}`);
            // If both dates, use billablePeriod range
            if (dateFrom && dateTo) {
                params.delete('service-date');
                params.set('billablePeriod', `ge${dateFrom}`);
                // CMS Blue Button uses _lastUpdated or service-date
                // Use service-date with ge/le for date range
                params.delete('billablePeriod');
                params.set('service-date', `ge${dateFrom}`);
                params.append('service-date', `le${dateTo}`);
            }
            fetchUrl = `${BASE}/ExplanationOfBenefit/?${params.toString()}`;
        } else {
            fetchUrl = `${BASE}/${resource}/`;
        }
    } else {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid resource' }) };
    }

    try {
        const result = await httpsGet(fetchUrl, {
            'Authorization': `Bearer ${access_token}`,
            'Accept': 'application/json'
        });
        return { statusCode: result.status, headers: cors, body: result.body };
    } catch(err) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
    }
};
