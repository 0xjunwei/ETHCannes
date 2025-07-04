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

// 1 ETH in wei (10^18)
const ONE_ETH = '0x0de0b6b3a7640000';

/**
 * Handle ALL JSON-RPC requests
 */
app.post('/', async (req, res) => {
  const payload = req.body;
  // Get the request type from headers - either 'real' or 'spoof'
  const requestType = req.headers['x-balance-type'] || 'spoof';

  // Basic validation
  if (!payload || typeof payload !== 'object' || !payload.method) {
    return res.status(400).json({ error: 'Invalid JSON-RPC payload' });
  }

  try {
    // Handle eth_getBalance calls differently based on request type
    if (payload.method === 'eth_getBalance') {
      if (requestType === 'real') {
        console.log('💰 Getting real balance from upstream');
        const upstreamResponse = await forwardRpc(payload);
        return res.json(upstreamResponse);
      } else {
        console.log('💰 Returning spoofed balance of 1 ETH');
        return res.json({
          jsonrpc: '2.0',
          id: payload.id,
          result: ONE_ETH // Return 1 ETH for UI enabling
        });
      }
    }

    // Special handling for eth_sendTransaction
    if (payload.method === 'eth_sendTransaction' && Array.isArray(payload.params)) {
      const tx = payload.params[0];
      console.log('⛽ Processing transaction from:', tx.from);
      
      // Get current chain ID
      const chainIdRes = await forwardRpc({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'eth_chainId',
        params: [],
      });
      const chainId = chainIdRes.result || '0x1';

      // Here you can add your gas sponsorship logic
      // await sponsorGas(tx, chainId);
      console.log('✅ Transaction ready to forward');
    }

    // Forward ALL other requests to upstream RPC
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

app.listen(config.port, config.host, () => {
  console.log(`🚀 JSON-RPC proxy listening on http://${config.host}:${config.port}`);
  console.log('➡️  Forwarding to', config.upstreamRpcUrl);
}); 