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

// Add this helper function to calculate gas in ETH
function weiToEth(wei) {
  return Number(wei) / 1e18;
}

// Add standard gas costs
const STANDARD_GAS_COSTS = {
  ETH_TRANSFER: 21000n,
  ERC20_TRANSFER: 65000n,
  ERC20_APPROVE: 46000n,
  SWAP: 200000n,
  DEFAULT: 100000n
};

// Helper to identify transaction type
function identifyTransactionType(tx) {
  if (!tx.data || tx.data === '0x') {
    return 'ETH_TRANSFER';
  }
  
  // Check function signatures
  const functionSig = tx.data.slice(0, 10).toLowerCase();
  switch (functionSig) {
    case '0xa9059cbb': // transfer(address,uint256)
      return 'ERC20_TRANSFER';
    case '0x095ea7b3': // approve(address,uint256)
      return 'ERC20_APPROVE';
    case '0x38ed1739': // swapExactTokensForTokens
    case '0x7ff36ab5': // swapExactETHForTokens
    case '0x18cbafe5': // swapExactTokensForETH
      return 'SWAP';
    default:
      return 'DEFAULT';
  }
}

// Add this helper to estimate gas for transactions
async function estimateGasAndCost(tx) {
  try {
    // Get current gas price first
    const gasPriceResponse = await forwardRpc({
      jsonrpc: '2.0',
      method: 'eth_gasPrice',
      params: [],
      id: Date.now()
    });

    if (!gasPriceResponse?.result) {
      throw new Error('Failed to get gas price');
    }

    const gasPrice = fromHex(gasPriceResponse.result);
    let gasLimit;

    try {
      // Try to estimate gas
      const gasEstimateResponse = await forwardRpc({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [{
          from: tx.from,
          to: tx.to,
          data: tx.data || '0x',
          value: tx.value || '0x0'
        }],
        id: Date.now()
      });

      if (gasEstimateResponse?.result) {
        gasLimit = fromHex(gasEstimateResponse.result);
        console.log('✅ Using estimated gas limit:', gasLimit.toString());
      } else {
        throw new Error('Gas estimation failed');
      }
    } catch (estimateError) {
      // Use standard gas costs as fallback
      const txType = identifyTransactionType(tx);
      gasLimit = STANDARD_GAS_COSTS[txType];
      console.log(`⚠️ Using standard gas limit for ${txType}:`, gasLimit.toString());
    }

    // Calculate total gas cost
    const gasCost = gasPrice * gasLimit;

    const result = {
      gasPrice,
      gasLimit,
      totalCost: gasCost,
      formatted: {
        gasPrice: weiToEth(gasPrice),
        totalCost: weiToEth(gasCost),
        gasLimit: Number(gasLimit)
      },
      isEstimated: true
    };

    console.log('💡 Gas calculation details:', {
      type: identifyTransactionType(tx),
      gasPrice: result.formatted.gasPrice.toFixed(9),
      gasLimit: result.formatted.gasLimit,
      totalCost: result.formatted.totalCost.toFixed(6)
    });

    return result;

  } catch (error) {
    console.error('Error in gas estimation:', error.message);
    // Return null to indicate failure
    return null;
  }
}

// Add this helper to check if method requires gas
function requiresGas(method) {
  return [
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'eth_call',
    'eth_estimateGas'
  ].includes(method);
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
    // Check if this request requires gas
    if (requiresGas(payload.method) && payload.params?.[0]) {
      const tx = payload.params[0];
      const gas = await estimateGasAndCost(tx);
      
      if (gas) {
        const txType = identifyTransactionType(tx);
        console.log(`⛽ ${payload.method} [${txType}] - Gas: ${gas.formatted.gasLimit} units, Cost: ${gas.formatted.totalCost.toFixed(6)} ETH @ ${gas.formatted.gasPrice.toFixed(9)} ETH/unit`);
      } else {
        console.log(`⚠️ Could not calculate gas for ${payload.method}`);
      }
    }

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