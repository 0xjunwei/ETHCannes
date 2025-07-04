const axios = require('axios');
const { upstreamRpcUrl } = require('./config');

/**
 * Forwards a single JSON-RPC payload to the upstream provider.
 * @param {object} payload - JSON-RPC 2.0 request object.
 * @returns {Promise<object>} JSON-RPC 2.0 response object.
 */
async function forwardRpc(payload) {
  try {
    console.log(`🔄 Forwarding request to ${upstreamRpcUrl}:`, payload.method);
    
    const res = await axios.post(upstreamRpcUrl, payload, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000, // increased timeout to 30 seconds
    });
    
    console.log(`✅ Response received for ${payload.method}`);
    return res.data;
  } catch (error) {
    console.error('❌ RPC forwarding error:', {
      method: payload.method,
      url: upstreamRpcUrl,
      error: error.message,
      response: error.response?.data,
    });
    
    return {
      jsonrpc: '2.0',
      id: payload.id,
      error: {
        code: -32603,
        message: `RPC request failed: ${error.message}`,
        data: error.response?.data
      }
    };
  }
}

module.exports = { forwardRpc }; 