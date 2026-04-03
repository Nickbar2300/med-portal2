// submit-hipaa temporarily disabled pending Azure Storage SDK setup
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, message: 'HIPAA storage coming soon' })
  };
};
