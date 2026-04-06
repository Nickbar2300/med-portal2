exports.handler = async function (event) {
    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Email delivery coming soon' })
    };
};
