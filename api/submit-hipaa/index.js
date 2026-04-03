const { app } = require('@azure/functions');

app.http('submit-hipaa', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return { status: 200, headers: corsHeaders, body: '' };
    return { status: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: 'HIPAA received - storage coming soon' }) };
  }
});
