module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, message: 'HIPAA received - storage coming soon' })
  };
};
