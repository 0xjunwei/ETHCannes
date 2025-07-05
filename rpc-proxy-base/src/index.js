import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fetch from 'node-fetch';
import { ethers } from 'ethers';
import { forwardRpc, forwardRpcWithLoadBalancing, getRpcHealthStatus, initializeRpcHealth } from './forwarder.js';
import config from './config.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Initialize RPC health monitoring
initializeRpcHealth();

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

// Function to decode raw transaction using manual parsing + ethers v6
function decodeRawTransaction(rawTxData) {
  try {
    console.log(`🔍 Attempting to decode raw transaction: ${rawTxData.substring(0, 50)}...`);
    
    // First try with ethers Transaction.from()
    let parsedTx;
    try {
      parsedTx = ethers.Transaction.from(rawTxData);
    } catch (ethersError) {
      console.log(`⚠️ Ethers parsing failed: ${ethersError.message}`);
      console.log(`🔄 Falling back to RLP decoding...`);
      
      // Fallback: Use basic RLP decoding (you have rlp package installed)
      return decodeRawTransactionWithRLP(rawTxData);
    }
    
    // Extract transaction details from ethers parsing
    const decodedTx = {
      from: parsedTx.from,
      to: parsedTx.to,
      value: parsedTx.value ? '0x' + parsedTx.value.toString(16) : '0x0',
      data: parsedTx.data || '0x',
      gasLimit: parsedTx.gasLimit ? '0x' + parsedTx.gasLimit.toString(16) : '0x0',
      gasPrice: parsedTx.gasPrice ? '0x' + parsedTx.gasPrice.toString(16) : '0x0',
      nonce: '0x' + (parsedTx.nonce || 0).toString(16),
      chainId: parsedTx.chainId || 84532,
      type: parsedTx.type,
      hash: parsedTx.hash
    };
    
    console.log(`✅ Successfully decoded with ethers v6`);
    console.log(`   From: ${decodedTx.from}`);
    console.log(`   To: ${decodedTx.to}`);
    console.log(`   Data: ${decodedTx.data.substring(0, 42)}...`);
    
    // Decode function call if it's a contract interaction
    if (decodedTx.data && decodedTx.data !== '0x' && decodedTx.to) {
      decodedTx.decodedData = decodeFunctionCall(decodedTx.data, decodedTx.to);
    }
    
    return decodedTx;
  } catch (error) {
    console.error('Error decoding raw transaction:', error.message);
    return null;
  }
}

// Fallback RLP-based decoder using the rlp package you already have
function decodeRawTransactionWithRLP(rawTxData) {
  try {
    // This is a fallback - for now, let's just extract what we can
    console.log(`⚠️ Using fallback RLP decoder - limited functionality`);
    
    // For now, return a minimal object that won't break the system
    return {
      from: 'UNKNOWN_RLP', // We can't easily get this without signature recovery
      to: null,
      value: '0x0',
      data: '0x',
      gasLimit: '0x0',
      gasPrice: '0x0',
      nonce: '0x0',
      chainId: 84532,
      type: 0,
      hash: null
    };
  } catch (error) {
    console.error('RLP fallback also failed:', error.message);
    return null;
  }
}

// Helper function to decode function call data
function decodeFunctionCall(data, contractAddress) {
  try {
    const functionSig = data.slice(0, 10).toLowerCase();
    
    switch (functionSig) {
      case '0x095ea7b3': // approve(address,uint256)
        return {
          functionName: 'approve',
          signature: functionSig,
        };
      case '0xa9059cbb': // transfer(address,uint256)
        return {
          functionName: 'transfer',
          signature: functionSig,
        };
      case '0x23b872dd': // transferFrom(address,address,uint256)
        return {
          functionName: 'transferFrom',
          signature: functionSig,
        };
      default:
        return {
          functionName: 'unknown',
          signature: functionSig,
        };
    }
  } catch (error) {
    console.error('Error decoding function call:', error.message);
    return null;
  }
}

// Add these variables at the top level of the file, after the imports
let cachedEthPrice = null;
let lastPriceUpdate = 0;
const PRICE_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds

// Modify the getEthPrice function to use caching and load balancing
async function getEthPrice() {
  const now = Date.now();
  
  // Return cached price if it's less than 1 minute old
  if (cachedEthPrice && (now - lastPriceUpdate) < PRICE_UPDATE_INTERVAL) {
    return cachedEthPrice;
  }

  try {
    // Use the first RPC URL for price fetching (Alchemy API)
    const upstreamUrl = new URL(config.upstreamRpcUrls[0]);
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
    const balanceResponse = await forwardRpcWithLoadBalancing({
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

// Update the estimateGasAndCost function to use load balancing
async function estimateGasAndCost(tx) {
  try {
    // Get ETH price first
    const ethPrice = await getEthPrice();
    if (!ethPrice) {
      console.warn('⚠️ Could not fetch ETH price, USD estimates will not be available');
    }

    // Get current gas price with load balancing
    const gasPriceResponse = await forwardRpcWithLoadBalancing({
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
      // Try to estimate gas with load balancing
      const gasEstimateResponse = await forwardRpcWithLoadBalancing({
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
async function checkSufficientBalance(userAddress, requiredGas, txValue = 0n) {
  const userBalance = await getActualUserBalance(userAddress);
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
  
  // Handle raw transactions differently
  if (payload.method === 'eth_sendRawTransaction') {
    // Decode the raw transaction to extract sender address and other details
    const decodedTx = decodeRawTransaction(tx);
    
    if (decodedTx) {
      console.log(`🔒 HOLDING RAW TRANSACTION #${txId}`);
      console.log(`   From: ${decodedTx.from}`);
      console.log(`   To: ${decodedTx.to || 'Contract Creation'}`);
      console.log(`   Value: ${decodedTx.value}`);
      console.log(`   Gas Limit: ${parseInt(decodedTx.gasLimit, 16)}`);
      console.log(`   Gas Price: ${parseInt(decodedTx.gasPrice, 16)} wei`);
      console.log(`   Nonce: ${parseInt(decodedTx.nonce, 16)}`);
      console.log(`   Chain ID: ${decodedTx.chainId}`);
      console.log(`   Type: ${decodedTx.type}`);
      console.log(`   Hash: ${decodedTx.hash}`);
      if (decodedTx.decodedData) {
        console.log(`   Function: ${decodedTx.decodedData.functionName}`);
      }
      console.log(`   Data: ${decodedTx.data.substring(0, 42)}...`);
      console.log(`   Gas Required: ${gasEstimate.formatted.totalCost.toFixed(6)} ETH`);
      if (gasEstimate.formatted.usdCost) {
        console.log(`   USD Cost: $${gasEstimate.formatted.usdCost}`);
      }
      
      const heldTx = {
        id: txId,
        payload,
        gasEstimate,
        userAddress: decodedTx.from, // Now we can extract the sender address!
        txType: 'RAW_TRANSACTION',
        timestamp: Date.now(),
        res,
        pollCount: 0,
        isRawTransaction: true,
        decodedTx: decodedTx // Store the decoded transaction data
      };
      
      heldTransactions.set(txId, heldTx);
      
      // Now we can check balance for raw transactions too!
      console.log(`🔍 Starting balance polling for RAW TRANSACTION #${txId}`);
      pollTransactionBalance(txId);
    } else {
      console.log(`🔒 HOLDING RAW TRANSACTION #${txId} (DECODING FAILED)`);
      console.log(`   Raw Data: ${tx.substring(0, 42)}...`);
      console.log(`   Gas Required: ${gasEstimate.formatted.totalCost.toFixed(6)} ETH`);
      if (gasEstimate.formatted.usdCost) {
        console.log(`   USD Cost: $${gasEstimate.formatted.usdCost}`);
      }
      
      const heldTx = {
        id: txId,
        payload,
        gasEstimate,
        userAddress: 'UNKNOWN', // Fallback for failed decoding
        txType: 'RAW_TRANSACTION',
        timestamp: Date.now(),
        res,
        pollCount: 0,
        isRawTransaction: true
      };
      
      heldTransactions.set(txId, heldTx);
      
      // Fallback to time-based release for failed decoding
      console.log(`⏰ RAW TRANSACTION will be held for 15 seconds (decoding failed)`);
      setTimeout(() => {
        if (heldTransactions.has(txId)) {
          console.log(`⏰ AUTO-RELEASING RAW TRANSACTION #${txId} after 15 seconds`);
          releaseRawTransaction(txId);
        }
      }, 15000);
    }
    
  } else {
    // Normal transaction handling
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
      pollCount: 0,
      isRawTransaction: false
    };
    
    heldTransactions.set(txId, heldTx);
    
    // Start polling for balance updates
    pollTransactionBalance(txId);
  }
  
  // Don't send response yet - it will be sent when transaction is released
  console.log(`📊 Currently holding ${heldTransactions.size} transaction(s)`);
}

// Helper function to release raw transactions
async function releaseRawTransaction(txId) {
  const heldTx = heldTransactions.get(txId);
  if (!heldTx) return;
  
  console.log(`🚀 RELEASING RAW TRANSACTION #${txId}`);
  
  // Remove from held transactions
  heldTransactions.delete(txId);
  
  // Forward the transaction
  try {
    const upstreamResponse = await forwardRpcWithLoadBalancing(heldTx.payload);
    heldTx.res.json(upstreamResponse);
    
    console.log(`✅ RAW TRANSACTION #${txId} FORWARDED SUCCESSFULLY`);
    console.log(`📊 Currently holding ${heldTransactions.size} transaction(s)`);
  } catch (error) {
    console.error(`❌ Error forwarding raw transaction #${txId}:`, error.message);
    heldTx.res.status(500).json({ 
      error: `Raw transaction forwarding failed: ${error.message}`,
      code: -32603
    });
  }
}

// Poll user balance for held transaction
async function pollTransactionBalance(txId) {
  const heldTx = heldTransactions.get(txId);
  if (!heldTx) return;
  
  heldTx.pollCount++;
  
  try {
    const tx = heldTx.payload.params[0];
    const txValue = tx.value ? fromHex(tx.value) : 0n;
    const balanceCheck = await checkSufficientBalance(heldTx.userAddress, heldTx.gasEstimate, txValue);
    
    console.log(`🔍 POLLING TRANSACTION #${txId} (Poll #${heldTx.pollCount})`);
    console.log(`   User Balance: ${weiToEth(balanceCheck.userBalance).toFixed(6)} ETH`);
    console.log(`   Required: ${weiToEth(balanceCheck.required).toFixed(6)} ETH`);
    console.log(`   Status: ${balanceCheck.hasEnough ? '✅ SUFFICIENT' : '❌ INSUFFICIENT'}`);
    
    if (balanceCheck.hasEnough) {
      // Check if this is our watched approval transaction
      if (isWatchedApproval(tx, heldTx.decodedTx)) {
        console.log(`🎯 RELEASING WATCHED APPROVAL TRANSACTION #${txId} IMMEDIATELY`);
        heldTransactions.delete(txId);
        
        try {
          const upstreamResponse = await forwardRpcWithLoadBalancing(heldTx.payload);
          heldTx.res.json(upstreamResponse);
          console.log(`✅ WATCHED APPROVAL TRANSACTION #${txId} FORWARDED SUCCESSFULLY`);
        } catch (error) {
          console.error(`❌ Error forwarding watched approval transaction #${txId}:`, error.message);
          heldTx.res.status(500).json({ 
            error: `Transaction forwarding failed: ${error.message}`,
            code: -32603
          });
        }
        return; // Exit early for watched approval
      }
      
      // Regular transaction release logic continues...
      console.log(`🚀 RELEASING TRANSACTION #${txId} - Balance requirement met!`);
      heldTransactions.delete(txId);
      
      try {
        const upstreamResponse = await forwardRpcWithLoadBalancing(heldTx.payload);
        heldTx.res.json(upstreamResponse);
        console.log(`✅ TRANSACTION #${txId} FORWARDED SUCCESSFULLY`);
      } catch (error) {
        console.error(`❌ Error forwarding transaction #${txId}:`, error.message);
        heldTx.res.status(500).json({ 
          error: `Transaction forwarding failed: ${error.message}`,
          code: -32603
        });
      }
    } else {
      // Continue polling after 1 second
      setTimeout(() => pollTransactionBalance(txId), 1000); // Changed from 2000 to 1000 milliseconds
    }
  } catch (error) {
    console.error(`Error polling transaction #${txId}:`, error.message);
    setTimeout(() => pollTransactionBalance(txId), 1000); // Changed from 2000 to 1000 milliseconds
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

// Add near the top with other constants
const WATCHED_APPROVAL = {
  tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'.toLowerCase(),
  spenderAddress: '0x96f1D2642455011aC5bEBF2cB875fc85F0Cb3691'.toLowerCase(),
  functionName: 'approve'
};

// Add this function to check if it's our watched approval
function isWatchedApproval(tx, decodedTx = null) {
  // Handle both regular transactions and decoded raw transactions
  const txData = decodedTx ? decodedTx.data : tx.data;
  const txTo = decodedTx ? decodedTx.to : tx.to;
  
  if (!txData) return false;
  
  // Check if it's an approval function call (0x095ea7b3)
  if (!txData.startsWith('0x095ea7b3')) return false;
  
  // Check token address
  if (txTo?.toLowerCase() !== WATCHED_APPROVAL.tokenAddress) return false;
  
  // Extract spender address from calldata
  const spenderAddress = '0x' + txData.slice(34, 74).toLowerCase();
  if (spenderAddress !== WATCHED_APPROVAL.spenderAddress) return false;
  
  return true;
}

// Update requestGasDrop function to use gas estimation with 10% buffer
async function requestGasDrop(userAddress, tx, gasEstimate) {
  try {
    // Calculate ETH amount from gas estimation with 10% buffer
    const baseEthAmount = gasEstimate.formatted.totalCost;
    const ethAmountWithBuffer = (baseEthAmount * 1.4).toFixed(6); // 10% buffer, rounded to 6 decimals
    
    console.log(`\n🎯 REQUESTING GAS DROP for ${userAddress}`);
    console.log(`   Base Gas Cost: ${baseEthAmount.toFixed(6)} ETH`);
    console.log(`   With 10% Buffer: ${ethAmountWithBuffer} ETH`);
    
    const response = await fetch('http://127.0.0.1:3000/api/gas-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test1'
      },
      body: JSON.stringify({
        user: userAddress,
        eth: ethAmountWithBuffer,
        src: 'base'
      })
    });

    if (!response.ok) {
      throw new Error(`Gas drop API returned ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ GAS DROP REQUESTED SUCCESSFULLY:`);
    console.log(`   User: ${userAddress}`);
    console.log(`   ETH Amount: ${ethAmountWithBuffer}`);
    console.log(`   Source: base`);
    console.log(`   Response:`, result);
    return true;
  } catch (error) {
    console.error(`❌ GAS DROP REQUEST FAILED:`, error.message);
    return false;
  }
}

// Update requestRelay function to use gas estimation with 10% buffer
async function requestRelay(userAddress, tx, gasEstimate, rpcUrl = null) {
  try {
    // Calculate ETH amount from gas estimation with 10% buffer
    const baseEthAmount = gasEstimate.formatted.totalCost;
    const ethAmountWithBuffer = (baseEthAmount * 1.1).toFixed(6); // 10% buffer, rounded to 6 decimals
    
    // Determine source chain from RPC URL if provided
    let sourceChain = 'base'; // Update default for base proxy
    let destinationChain = 'arbitrum'; // Update default destination for base proxy
    
    if (rpcUrl) {
      const chainInfo = config.rpcToChainMap.get(rpcUrl);
      if (chainInfo) {
        // Map chain names to API format
        const chainMapping = {
          'arbitrum-sepolia': 'arbitrum',
          'base-sepolia': 'base', 
          'optimism-sepolia': 'optimism'
        };
        sourceChain = chainMapping[chainInfo.name] || chainInfo.name;
        
        // Set destination based on source (cross-chain relay)
        switch(sourceChain) {
          case 'arbitrum':
            destinationChain = 'base';
            break;
          case 'base':
            destinationChain = 'optimism';
            break;
          case 'optimism':
            destinationChain = 'arbitrum';
            break;
          default:
            destinationChain = 'arbitrum';
        }
      }
    }
    
    console.log(`\n🔄 REQUESTING CROSS-CHAIN RELAY for ${userAddress}`);
    console.log(`   Base Gas Cost: ${baseEthAmount.toFixed(6)} ETH`);
    console.log(`   With 10% Buffer: ${ethAmountWithBuffer} ETH`);
    console.log(`   Source Chain: ${sourceChain}`);
    console.log(`   Destination Chain: ${destinationChain}`);
    console.log(`   Min Finality: 1000`);
    
    const response = await fetch('http://127.0.0.1:3000/api/relay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test1'
      },
      body: JSON.stringify({
        user: userAddress,
        eth: ethAmountWithBuffer,
        src: sourceChain,
        dst: destinationChain,
        minFinality: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Relay API returned ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ CROSS-CHAIN RELAY REQUESTED SUCCESSFULLY:`);
    console.log(`   User: ${userAddress}`);
    console.log(`   ETH Amount: ${ethAmountWithBuffer}`);
    console.log(`   Source: ${sourceChain} → Destination: ${destinationChain}`);
    console.log(`   Response:`, result);
    return true;
  } catch (error) {
    console.error(`❌ CROSS-CHAIN RELAY REQUEST FAILED:`, error.message);
    return false;
  }
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
        const upstreamResponse = await forwardRpcWithLoadBalancing(payload);
        
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

    // Modify the approval check section
    if (payload.method === 'eth_sendTransaction' && payload.params?.[0]) {
      const tx = payload.params[0];
    }

    // Check if this request requires gas
    if (requiresGas(payload.method) && payload.params?.[0]) {
      const tx = payload.params[0];
      
      // For raw transactions, decode first to get transaction details
      let txForGasEstimation = tx;
      let decodedTx = null;
      
      if (payload.method === 'eth_sendRawTransaction') {
        decodedTx = decodeRawTransaction(tx);
        if (decodedTx) {
          txForGasEstimation = {
            from: decodedTx.from,
            to: decodedTx.to,
            value: decodedTx.value,
            data: decodedTx.data,
            gas: decodedTx.gasLimit,
            gasPrice: decodedTx.gasPrice
          };
          
          // CHECK FOR WATCHED APPROVAL IN RAW TRANSACTIONS
          if (isWatchedApproval(null, decodedTx)) {
            // Request gas drop before proceeding
            console.log(`\n💧 REQUESTING GAS DROP FOR RAW TRANSACTION...`);
            const gasEstimate = await estimateGasAndCost(txForGasEstimation); // Get gas estimate for gas drop
            const gasDropSuccess = await requestGasDrop(decodedTx.from, decodedTx, gasEstimate);
            
            if (gasDropSuccess) {
              console.log(`✅ GAS DROP REQUEST SUCCESSFUL - Proceeding with raw approval`);
            } else {
              console.log(`❌ GAS DROP REQUEST FAILED - Will still check balance and proceed`);
            }
            
            // Continue with gas estimation but mark this as a special case
            console.log(`🔍 Continuing with gas estimation for watched raw approval...`);
          }
        }
      }
      
      console.log(`\n🚀 TRANSACTION PROCESSING START`);
      console.log(`   Method: ${payload.method}`);
      if (payload.method === 'eth_sendRawTransaction' && decodedTx) {
        console.log(`   From: ${decodedTx.from}`);
        console.log(`   To: ${decodedTx.to || 'Contract Creation'}`);
        console.log(`   Value: ${decodedTx.value}`);
        console.log(`   Data: ${decodedTx.data.substring(0, 42) + '...'}`);
        console.log(`   Gas: ${parseInt(decodedTx.gasLimit, 16)}`);
        console.log(`   Gas Price: ${parseInt(decodedTx.gasPrice, 16)} wei`);
        if (decodedTx.decodedData) {
          console.log(`   Function: ${decodedTx.decodedData.functionName}`);
        }
      } else {
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Value: ${tx.value || '0x0'}`);
        console.log(`   Data: ${tx.data ? tx.data.substring(0, 42) + '...' : 'None'}`);
        console.log(`   Gas: ${tx.gas || 'Auto'}`);
        console.log(`   Gas Price: ${tx.gasPrice || 'Auto'}`);
      }
      
      // Continue with rest of processing...
      let gas = await estimateGasAndCost(txForGasEstimation);
      
      console.log(`\n💡 GAS ESTIMATION RESULT:`);
      if (gas) {
        console.log(`   ✅ Gas estimation successful`);
        console.log(`   Gas Limit: ${gas.formatted.gasLimit}`);
        console.log(`   Gas Price: ${gas.formatted.gasPrice.toFixed(9)} ETH`);
        console.log(`   Total Cost: ${gas.formatted.totalCost.toFixed(6)} ETH`);
      } else {
        console.log(`   ❌ Gas estimation failed`);
      }
      
      // If gas estimation failed, create a fallback gas estimate for balance checking
      if (!gas) {
        console.log(`\n⚠️ Gas estimation failed for ${payload.method}, creating fallback estimate`);
        
        // Create fallback gas estimate using standard costs
        const txType = identifyTransactionType(tx);
        const defaultGasLimit = STANDARD_GAS_COSTS[txType];
        
        // Get current gas price for fallback calculation
        try {
          const gasPriceResponse = await forwardRpcWithLoadBalancing({
            jsonrpc: '2.0',
            method: 'eth_gasPrice',
            params: [],
            id: Date.now()
          });
          
          if (gasPriceResponse?.result) {
            const gasPrice = fromHex(gasPriceResponse.result);
            const gasCost = gasPrice * defaultGasLimit;
            
            gas = {
              gasPrice,
              gasLimit: defaultGasLimit,
              totalCost: gasCost,
              formatted: {
                gasPrice: weiToEth(gasPrice),
                totalCost: weiToEth(gasCost),
                gasLimit: Number(defaultGasLimit),
                usdCost: null
              },
              isEstimated: false
            };
            console.log(`📊 Using fallback gas estimate: ${weiToEth(gasCost).toFixed(6)} ETH`);
          }
        } catch (fallbackError) {
          console.error('Failed to create fallback gas estimate:', fallbackError.message);
        }
      }
      
      // After gas estimation, add the gas drop request for watched approvals
      if (gas && payload.method === 'eth_sendRawTransaction' && decodedTx && isWatchedApproval(null, decodedTx)) {
        console.log(`\n💧 REQUESTING GAS DROP FOR WATCHED APPROVAL...`);
        const gasDropSuccess = await requestGasDrop(decodedTx.from, decodedTx, gas);
        
        if (gasDropSuccess) {
          console.log(`✅ GAS DROP REQUEST SUCCESSFUL - Proceeding with approval`);
        } else {
          console.log(`❌ GAS DROP REQUEST FAILED - Will still proceed`);
        }
      }

      if (gas) {
        const txType = identifyTransactionType(tx);
        console.log(`⛽ ${payload.method} [${txType}]:`);
        console.log(`   Gas: ${gas.formatted.gasLimit} units @ ${gas.formatted.gasPrice.toFixed(9)} ETH/unit`);
        console.log(`   Cost: ${gas.formatted.totalCost.toFixed(6)} ETH`);
        if (gas.formatted.usdCost) {
          console.log(`   USD Cost: $${gas.formatted.usdCost}`);
        }

        // Check if this transaction requires balance checking
        if (requiresBalanceCheck(payload.method)) {
          if (payload.method === 'eth_sendRawTransaction') {
            console.log(`\n🎯 FINAL DECISION:`);
            console.log(`   🔒 RAW TRANSACTION - Will be HELD automatically`);
            
            // Check if this is NOT a watched approval, then request same-chain gas
            if (decodedTx && !isWatchedApproval(null, decodedTx)) {
              console.log(`\n🔄 NON-WATCHED APPROVAL RAW TRANSACTION - Requesting cross-chain relay`);
              await requestRelay(decodedTx.from, decodedTx, gas);
            } else if (decodedTx && isWatchedApproval(null, decodedTx)) {
              console.log(`\n🎯 WATCHED APPROVAL RAW TRANSACTION - Skipping cross-chain gas request`);
            }
            
            // Hold the transaction and return - response will be sent when released
            await holdTransaction(payload, gas, res);
            return; // Don't continue processing
          } else if (tx.from) {
            // Normal transaction object handling (existing code)
            console.log(`\n🔍 BALANCE CHECK DECISION:`);
            console.log(`   Requires Balance Check: ${requiresBalanceCheck(payload.method)}`);
            console.log(`   Has From Address: ${!!tx.from}`);
            console.log(`   Will Check Balance: ${requiresBalanceCheck(payload.method) && tx.from}`);
            
            const txValue = tx.value ? fromHex(tx.value) : 0n;
            console.log(`\n💰 GETTING BALANCE CHECK RESULT...`);
            const balanceCheck = await checkSufficientBalance(tx.from, gas, txValue);
            
            console.log(`💰 BALANCE CHECK for ${tx.from}:`);
            console.log(`   Current Balance: ${weiToEth(balanceCheck.userBalance).toFixed(6)} ETH`);
            console.log(`   Required: ${weiToEth(balanceCheck.required).toFixed(6)} ETH`);
            console.log(`   Gas Cost: ${weiToEth(balanceCheck.gasOnly).toFixed(6)} ETH`);
            if (balanceCheck.txValue > 0n) {
              console.log(`   Transaction Value: ${weiToEth(balanceCheck.txValue).toFixed(6)} ETH`);
            }
            
            console.log(`\n🎯 FINAL DECISION:`);
            if (!balanceCheck.hasEnough) {
              console.log(`   ❌ INSUFFICIENT BALANCE - Transaction will be HELD`);
              console.log(`   Shortage: ${weiToEth(balanceCheck.required - balanceCheck.userBalance).toFixed(6)} ETH`);
              console.log(`   🔒 HOLDING TRANSACTION NOW...`);
              
              // Check if this is NOT a watched approval, then request same-chain gas
              if (!isWatchedApproval(tx)) {
                console.log(`\n🔄 NON-WATCHED APPROVAL TRANSACTION - Requesting cross-chain relay`);
                await requestRelay(tx.from, tx, gas);
              } else {
                console.log(`\n🎯 WATCHED APPROVAL TRANSACTION - Skipping cross-chain gas request`);
              }
              
              // Hold the transaction and return - response will be sent when released
              await holdTransaction(payload, gas, res);
              return; // Don't continue processing
            } else {
              console.log(`   ✅ SUFFICIENT BALANCE - Transaction will PROCEED`);
              console.log(`   Excess: ${weiToEth(balanceCheck.userBalance - balanceCheck.required).toFixed(6)} ETH`);
            }
          }
        } else if (requiresGas(payload.method)) {
          console.log(`\n🔍 BALANCE CHECK DECISION:`);
          console.log(`   Requires Balance Check: ${requiresBalanceCheck(payload.method)}`);
          console.log(`   Has From Address: ${!!tx.from}`);
          console.log(`   Will Check Balance: false`);
          console.log(`   ✅ SKIPPING BALANCE CHECK - Transaction will PROCEED`);
        }
        console.log(`\n🚀 PROCEEDING TO FORWARD TRANSACTION...`);
      } else {
        console.log(`\n⚠️ Could not calculate gas for ${payload.method}`);
        console.log(`   ❌ PROCEEDING WITHOUT BALANCE CHECK`);
        console.log(`   🚨 TRANSACTION WILL BE FORWARDED IMMEDIATELY`);
      }
    }

    // Check if this request should return spoofed balance
    if (shouldSpoofBalance(payload)) {
      if (requestType === 'real') {
        const upstreamResponse = await forwardRpcWithLoadBalancing(payload);
        return res.json(upstreamResponse);
      } else {
        // Get the response from upstream first
        const upstreamResponse = await forwardRpcWithLoadBalancing(payload);
        
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
      const upstreamResponse = await forwardRpcWithLoadBalancing(payload);
      return res.json(upstreamResponse);
    }

    // Forward all other requests to upstream
    console.log(`   Method: ${payload.method}`);
    
    const upstreamResponse = await forwardRpcWithLoadBalancing(payload);
    
    if (upstreamResponse?.error) {
      console.log(`\n❌ UPSTREAM ERROR RESPONSE:`);
      console.log(`   Error Code: ${upstreamResponse.error.code}`);
      console.log(`   Error Message: ${upstreamResponse.error.message}`);
    } else if (upstreamResponse?.result) {
      console.log(`\n✅ UPSTREAM SUCCESS RESPONSE:`);
      console.log(`   Result: ${JSON.stringify(upstreamResponse.result).substring(0, 100)}...`);
    }
    
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
  console.log('➡️  Forwarding to', config.upstreamRpcUrls);
}); 