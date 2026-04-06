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

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: cors, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch(e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { code, code_verifier, redirect_uri } = body || {};
    if (!code || !code_verifier || !redirect_uri) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing parameters' }) };
    }

    const CLIENT_ID     = process.env.BB2_CLIENT_ID;
    const CLIENT_SECRET = process.env.BB2_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'BB2 credentials not configured' }) };
    }

    const formBody = querystring.stringify({
        grant_type: 'authorization_code',
        code, redirect_uri, code_verifier,
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    });

    try {
        const result = await httpsPost(
            'sandbox.bluebutton.cms.gov', '/v2/o/token/',
            { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(formBody) },
            formBody
        );
        let data;
        try { data = JSON.parse(result.body); }
        catch(e) { return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Non-JSON from BB2', raw: result.body.substring(0, 300) }) }; }
        return { statusCode: result.status, headers: cors, body: JSON.stringify(data) };
    } catch(err) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
    }
};
