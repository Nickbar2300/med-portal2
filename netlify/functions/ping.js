exports.handler = async function (event) {
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
            ok: true,
            node: process.version,
            env: {
                BB2_CLIENT_ID:      !!process.env.BB2_CLIENT_ID,
                BB2_CLIENT_SECRET:  !!process.env.BB2_CLIENT_SECRET,
                ANTHROPIC_API_KEY:  !!process.env.ANTHROPIC_API_KEY,
                TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
                PORTAL_URL:         !!process.env.PORTAL_URL,
            }
        })
    };
};
