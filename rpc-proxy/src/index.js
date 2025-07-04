const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { forwardRpc } = require('./forwarder');
const config = require('./config');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Convert number to hex string
function toHex(num) {
  return '0x' + num.toString(16);
}

// Convert hex to decimal
function fromHex(hex) {
  return BigInt(hex);
}

// 1 ETH in wei (10^18)
const ONE_ETH = '0x0de0b6b3a7640000';

// Methods that should return spoofed ETH balance
const ETH_BALANCE_METHODS = [
  'eth_getBalance',
  'eth_accounts',
  'eth_requestAccounts',
  'wallet_getPermissions',
  'wallet_requestPermissions',
  'eth_getAccountSnapshot',
  'eth_subscribe',  // Add subscription methods
  'eth_unsubscribe'
];

// Check if method should return spoofed balance
function shouldSpoofBalance(payload) {
  // Direct balance check
  if (payload.method === 'eth_getBalance' && payload.params?.[0]) {
    return true;
  }
  
  // MetaMask specific methods
  if (ETH_BALANCE_METHODS.includes(payload.method)) {
    return true;
  }

  // Check for subscription to newHeads (which triggers balance updates)
  if (payload.method === 'eth_subscribe' && 
      payload.params?.[0] === 'newHeads') {
    return true;
  }

  return false;
}

// Modify response to include spoofed balance
function modifyResponse(response, method) {
  if (!response) return response;

  // Clone the response to avoid modifying the original
  const modifiedResponse = JSON.parse(JSON.stringify(response));

  if (method === 'eth_getBalance') {
    modifiedResponse.result = ONE_ETH;
  } else if (method === 'eth_subscribe' || method === 'eth_unsubscribe') {
    // Let subscriptions pass through but modify their data
    if (modifiedResponse.result?.data?.balance) {
      modifiedResponse.result.data.balance = ONE_ETH;
    }
  }

  return modifiedResponse;
}

/**
 * Handle ALL JSON-RPC requests
 */
app.post('/', async (req, res) => {
  const payload = req.body;
  const requestType = req.headers['x-balance-type'] || 'spoof';

  // Basic validation
  if (!payload || typeof payload !== 'object' || !payload.method) {
    return res.status(400).json({ error: 'Invalid JSON-RPC payload' });
  }

  try {
    // Check if this request should return spoofed balance
    if (shouldSpoofBalance(payload)) {
      if (requestType === 'real') {
        console.log(`💰 Getting real balance for ${payload.method}`);
        const upstreamResponse = await forwardRpc(payload);
        return res.json(upstreamResponse);
      } else {
        console.log(`💰 Spoofing balance for ${payload.method}`);
        
        // Get the response from upstream first
        const upstreamResponse = await forwardRpc(payload);
        
        // Modify the response based on the method
        const modifiedResponse = modifyResponse(upstreamResponse, payload.method);
        
        // Always ensure we're sending 1 ETH for balance requests
        if (payload.method === 'eth_getBalance') {
          return res.json({
            jsonrpc: '2.0',
            id: payload.id,
            result: ONE_ETH
          });
        }
        
        return res.json(modifiedResponse);
      }
    }

    // Special handling for eth_call (token operations)
    if (payload.method === 'eth_call') {
      console.log('📞 Forwarding eth_call without modification');
      const upstreamResponse = await forwardRpc(payload);
      return res.json(upstreamResponse);
    }

    // Forward all other requests to upstream
    console.log(`🔄 Forwarding ${payload.method} to upstream`);
    const upstreamResponse = await forwardRpc(payload);
    return res.json(upstreamResponse);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ 
      error: err.message || 'Unexpected error',
      code: -32603
    });
  }
});

// Add CORS headers for MetaMask
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-balance-type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.listen(config.port, config.host, () => {
  console.log(`🚀 JSON-RPC proxy listening on http://${config.host}:${config.port}`);
  console.log('➡️  Forwarding to', config.upstreamRpcUrl);
  console.log('💰 Balance spoofing active for ETH balance checks');
}); 