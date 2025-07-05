import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fetch from 'node-fetch';
import { forwardRpc } from './forwarder.js';
import config from './config.js';

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

// Transaction holding system
const heldTransactions = new Map();
let transactionCounter = 0;

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

// Add these variables at the top level of the file, after the imports
let cachedEthPrice = null;
let lastPriceUpdate = 0;
const PRICE_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds

// Modify the getEthPrice function to use caching
async function getEthPrice() {
  const now = Date.now();
  
  // Return cached price if it's less than 1 minute old
  if (cachedEthPrice && (now - lastPriceUpdate) < PRICE_UPDATE_INTERVAL) {
    return cachedEthPrice;
  }

  try {
    // Extract API key from the RPC URL if using Alchemy
    const upstreamUrl = new URL(config.upstreamRpcUrl);
    const alchemyApiKey = upstreamUrl.pathname.split('/').pop();
    
    // Format URL exactly like the sample
    const url = `https://api.g.alchemy.com/prices/v1/${alchemyApiKey}/tokens/by-symbol?symbols=ETH`;
    const options = { 
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract price using the exact response format from the sample
    if (!data?.data?.[0]?.prices?.[0]?.value) {
      throw new Error('Invalid response format from price API');
    }

    const price = parseFloat(data.data[0].prices[0].value);
    const lastUpdatedAt = data.data[0].prices[0].lastUpdatedAt;
    
    // Update cache and timestamp
    cachedEthPrice = price;
    lastPriceUpdate = now;
    
    // Log price updates every minute with 2 decimal places
    console.log(`💲 ETH Price Update: $${price.toFixed(2)} (Updated: ${lastUpdatedAt})`);
    
    return price;

  } catch (error) {
    console.error('Error fetching ETH price:', error.message);
    // Return cached price if available, even if it's old, when there's an error
    return cachedEthPrice || null;
  }
}

// Get user's balance (using spoofed balance for consistency)
async function getUserBalance(address) {
  try {
    // Use spoofed balance (1 ETH) instead of real balance
    return fromHex(ONE_ETH);
  } catch (error) {
    console.error('Error getting user balance:', error.message);
    return 0n;
  }
}

// Get user's actual balance (for transaction holding - uses real balance)
async function getActualUserBalance(address) {
  try {
    const balanceResponse = await forwardRpc({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: Date.now()
    });

    if (!balanceResponse?.result) {
      throw new Error('Failed to get user balance');
    }

    return fromHex(balanceResponse.result);
  } catch (error) {
    console.error('Error getting actual user balance:', error.message);
    return 0n;
  }
}

// Update the estimateGasAndCost function to remove redundant logging
async function estimateGasAndCost(tx) {
  try {
    // Get ETH price first
    const ethPrice = await getEthPrice();
    if (!ethPrice) {
      console.warn('⚠️ Could not fetch ETH price, USD estimates will not be available');
    }

    // Get current gas price
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
      } else {
        throw new Error('Gas estimation failed');
      }
    } catch (estimateError) {
      const txType = identifyTransactionType(tx);
      gasLimit = STANDARD_GAS_COSTS[txType];
    }

    // Calculate costs with high precision
    const gasCost = gasPrice * gasLimit;
    const gasCostInEth = weiToEth(gasCost);
    const usdCost = ethPrice ? Number((gasCostInEth * ethPrice).toFixed(2)) : null;

    return {
      gasPrice,
      gasLimit,
      totalCost: gasCost,
      formatted: {
        gasPrice: weiToEth(gasPrice),
        totalCost: gasCostInEth,
        gasLimit: Number(gasLimit),
        usdCost: usdCost
      },
      isEstimated: true
    };

  } catch (error) {
    console.error('Error in gas estimation:', error.message);
    return null;
  }
}

// Check if user has sufficient balance for transaction
async function checkSufficientBalance(userAddress, requiredGas) {
  const userBalance = await getActualUserBalance(userAddress);
  const txValue = requiredGas.value ? fromHex(requiredGas.value) : 0n;
  const totalRequired = requiredGas.totalCost + txValue;
  
  return {
    hasEnough: userBalance >= totalRequired,
    userBalance,
    required: totalRequired,
    gasOnly: requiredGas.totalCost,
    txValue
  };
}

// Hold transaction until sufficient balance is available
async function holdTransaction(payload, gasEstimate, res) {
  const txId = ++transactionCounter;
  const tx = payload.params[0];
  const userAddress = tx.from;
  const txType = identifyTransactionType(tx);
  
  console.log(`🔒 HOLDING TRANSACTION #${txId}`);
  console.log(`   Type: ${txType}`);
  console.log(`   From: ${userAddress}`);
  console.log(`   To: ${tx.to || 'N/A'}`);
  console.log(`   Gas Required: ${gasEstimate.formatted.totalCost.toFixed(6)} ETH`);
  if (gasEstimate.formatted.usdCost) {
    console.log(`   USD Cost: $${gasEstimate.formatted.usdCost}`);
  }
  
  const heldTx = {
    id: txId,
    payload,
    gasEstimate,
    userAddress,
    txType,
    timestamp: Date.now(),
    res,
    pollCount: 0
  };
  
  heldTransactions.set(txId, heldTx);
  
  // Start polling for balance updates
  pollTransactionBalance(txId);
  
  // Don't send response yet - it will be sent when transaction is released
  console.log(`📊 Currently holding ${heldTransactions.size} transaction(s)`);
}

// Poll user balance for held transaction
async function pollTransactionBalance(txId) {
  const heldTx = heldTransactions.get(txId);
  if (!heldTx) return;
  
  heldTx.pollCount++;
  
  try {
    const balanceCheck = await checkSufficientBalance(heldTx.userAddress, heldTx.gasEstimate);
    
    console.log(`🔍 POLLING TRANSACTION #${txId} (Poll #${heldTx.pollCount})`);
    console.log(`   User Balance: ${weiToEth(balanceCheck.userBalance).toFixed(6)} ETH`);
    console.log(`   Required: ${weiToEth(balanceCheck.required).toFixed(6)} ETH`);
    console.log(`   Status: ${balanceCheck.hasEnough ? '✅ SUFFICIENT' : '❌ INSUFFICIENT'}`);
    
    if (balanceCheck.hasEnough) {
      console.log(`🚀 RELEASING TRANSACTION #${txId} - Balance requirement met!`);
      
      // Remove from held transactions
      heldTransactions.delete(txId);
      
      // Forward the transaction
      try {
        const upstreamResponse = await forwardRpc(heldTx.payload);
        heldTx.res.json(upstreamResponse);
        
        console.log(`✅ TRANSACTION #${txId} FORWARDED SUCCESSFULLY`);
        console.log(`📊 Currently holding ${heldTransactions.size} transaction(s)`);
      } catch (error) {
        console.error(`❌ Error forwarding transaction #${txId}:`, error.message);
        heldTx.res.status(500).json({ 
          error: `Transaction forwarding failed: ${error.message}`,
          code: -32603
        });
      }
    } else {
      // Continue polling after 2 seconds
      setTimeout(() => pollTransactionBalance(txId), 2000);
    }
  } catch (error) {
    console.error(`Error polling transaction #${txId}:`, error.message);
    // Continue polling despite error
    setTimeout(() => pollTransactionBalance(txId), 2000);
  }
}

// Add this helper to check if method requires gas
function requiresGas(method) {
  return [
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    // 'eth_estimateGas'
  ].includes(method);
}

// Methods that require balance checking (transactions that consume gas)
function requiresBalanceCheck(method) {
  return [
    'eth_sendTransaction',
    'eth_sendRawTransaction'
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
    // Special handling for eth_estimateGas - MetaMask uses this to enable/disable send button
    if (payload.method === 'eth_estimateGas' && payload.params?.[0]) {
      const tx = payload.params[0];
      
      console.log(`🔍 Gas estimation request for ${tx.from} - ensuring MetaMask compatibility`);
      
      try {
        // Try the normal gas estimation first
        const upstreamResponse = await forwardRpc(payload);
        
        if (upstreamResponse && upstreamResponse.result) {
          console.log(`✅ Gas estimation successful: ${upstreamResponse.result}`);
          return res.json(upstreamResponse);
        } else {
          throw new Error('Gas estimation failed');
        }
      } catch (error) {
        // If estimation fails (likely due to insufficient balance), return a reasonable default
        const txType = identifyTransactionType(tx);
        const defaultGas = STANDARD_GAS_COSTS[txType];
        const gasHex = toHex(Number(defaultGas));
        
        console.log(`⚠️ Gas estimation failed for ${txType}, using default: ${gasHex}`);
        console.log(`   Error: ${error.message}`);
        
        return res.json({
          jsonrpc: '2.0',
          id: payload.id,
          result: gasHex
        });
      }
    }

    // Check if this request requires gas
    if (requiresGas(payload.method) && payload.params?.[0]) {
      const tx = payload.params[0];
      const gas = await estimateGasAndCost(tx);
      
      if (gas) {
        const txType = identifyTransactionType(tx);
        console.log(`⛽ ${payload.method} [${txType}]:`);
        console.log(`   Gas: ${gas.formatted.gasLimit} units @ ${gas.formatted.gasPrice.toFixed(9)} ETH/unit`);
        console.log(`   Cost: ${gas.formatted.totalCost.toFixed(6)} ETH`);
        if (gas.formatted.usdCost) {
          console.log(`   USD Cost: $${gas.formatted.usdCost}`);
        }

        // Check if this transaction requires balance checking
        if (requiresBalanceCheck(payload.method) && tx.from) {
          const balanceCheck = await checkSufficientBalance(tx.from, gas);
          
          console.log(`💰 BALANCE CHECK for ${tx.from}:`);
          console.log(`   Current Balance: ${weiToEth(balanceCheck.userBalance).toFixed(6)} ETH`);
          console.log(`   Required: ${weiToEth(balanceCheck.required).toFixed(6)} ETH`);
          console.log(`   Gas Cost: ${weiToEth(balanceCheck.gasOnly).toFixed(6)} ETH`);
          if (balanceCheck.txValue > 0n) {
            console.log(`   Transaction Value: ${weiToEth(balanceCheck.txValue).toFixed(6)} ETH`);
          }
          
          if (!balanceCheck.hasEnough) {
            console.log(`❌ INSUFFICIENT BALANCE - Transaction will be held`);
            // Hold the transaction and return - response will be sent when released
            await holdTransaction(payload, gas, res);
            return; // Don't continue processing
          } else {
            console.log(`✅ SUFFICIENT BALANCE - Transaction will proceed`);
          }
        }
      } else {
        console.log(`⚠️ Could not calculate gas for ${payload.method}`);
      }
    }

    // Check if this request should return spoofed balance
    if (shouldSpoofBalance(payload)) {
      if (requestType === 'real') {
        const upstreamResponse = await forwardRpc(payload);
        return res.json(upstreamResponse);
      } else {
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
      const upstreamResponse = await forwardRpc(payload);
      return res.json(upstreamResponse);
    }

    // Forward all other requests to upstream
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

// Status endpoint to monitor held transactions
app.get('/status', (req, res) => {
  const heldTxs = Array.from(heldTransactions.values()).map(tx => ({
    id: tx.id,
    type: tx.txType,
    from: tx.userAddress,
    to: tx.payload.params[0].to,
    gasRequired: tx.gasEstimate.formatted.totalCost,
    usdCost: tx.gasEstimate.formatted.usdCost,
    timestamp: tx.timestamp,
    pollCount: tx.pollCount,
    heldFor: Date.now() - tx.timestamp
  }));

  res.json({
    status: 'running',
    heldTransactions: heldTxs,
    totalHeld: heldTransactions.size,
    uptime: process.uptime()
  });
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

// Add a price update interval when the server starts
// Add this just before the app.listen() call:
// Start periodic price updates
setInterval(async () => {
  await getEthPrice();
}, PRICE_UPDATE_INTERVAL);

// Initial price fetch
getEthPrice().catch(console.error);

app.listen(config.port, config.host, () => {
  console.log(`🚀 JSON-RPC proxy listening on http://${config.host}:${config.port}`);
  console.log('➡️  Forwarding to', config.upstreamRpcUrl);
}); 