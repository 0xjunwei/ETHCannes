import axios from 'axios';
import config from './config.js';

/**
 * Forwards a single JSON-RPC payload to the upstream provider.
 * @param {object} payload - JSON-RPC 2.0 request object.
 * @param {string} [customUrl] - Optional custom RPC URL to use instead of config default.
 * @returns {Promise<object>} JSON-RPC 2.0 response object.
 */
async function forwardRpc(payload, customUrl = null) {
  const targetUrl = customUrl || config.upstreamRpcUrls[0]; // Use first RPC as default if no custom URL
  
  try {
    
    const res = await axios.post(targetUrl, payload, {
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
      url: targetUrl.substring(0, 50) + '...',
      error: error.message,
      response: error.response?.data,
    });
    
    // Throw the error so the load balancer can handle retries
    throw new Error(`RPC request failed: ${error.message}`);
  }
}

/**
 * Load balancing state and health monitoring
 */
let currentRpcIndex = 0;
const rpcHealthStatus = new Map();

// Initialize health status for all RPCs
function initializeRpcHealth() {
  config.upstreamRpcUrls.forEach((url, index) => {
    rpcHealthStatus.set(index, { 
      healthy: true, 
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      url: url
    });
  });
  
  config.upstreamRpcUrls.forEach((url, index) => {
    console.log(`   RPC #${index + 1}: ${url.substring(0, 50)}...`);
  });
}

// Get next healthy RPC URL with round-robin load balancing
function getNextRpcUrl() {
  const totalRpcs = config.upstreamRpcUrls.length;
  
  if (totalRpcs === 0) {
    throw new Error('No RPC URLs configured');
  }
  
  if (totalRpcs === 1) {
    return { url: config.upstreamRpcUrls[0], index: 0 };
  }
  
  let attempts = 0;
  
  while (attempts < totalRpcs) {
    const status = rpcHealthStatus.get(currentRpcIndex);
    
    if (status && status.healthy) {
      const selectedUrl = config.upstreamRpcUrls[currentRpcIndex];
      const selectedIndex = currentRpcIndex;
      
      // Move to next RPC for next request
      currentRpcIndex = (currentRpcIndex + 1) % totalRpcs;
      
      return { url: selectedUrl, index: selectedIndex };
    }
    
    // Move to next RPC if current one is unhealthy
    currentRpcIndex = (currentRpcIndex + 1) % totalRpcs;
    attempts++;
  }
  
  // If all RPCs are unhealthy, use the first one and mark it as healthy for retry
  console.warn('⚠️ All RPCs marked as unhealthy, attempting with first RPC');
  rpcHealthStatus.get(0).healthy = true;
  rpcHealthStatus.get(0).consecutiveFailures = 0;
  currentRpcIndex = 1 % totalRpcs;
  
  return { url: config.upstreamRpcUrls[0], index: 0 };
}

// Mark RPC as healthy or unhealthy
function updateRpcHealth(rpcIndex, isHealthy, error = null) {
  const status = rpcHealthStatus.get(rpcIndex);
  
  if (!status) {
    console.warn(`⚠️ Attempted to update health for non-existent RPC index: ${rpcIndex}`);
    return;
  }
  
  if (isHealthy) {
    if (!status.healthy) {
      console.log(`✅ RPC #${rpcIndex + 1} recovered and marked as healthy`);
    }
    status.healthy = true;
    status.consecutiveFailures = 0;
    status.lastCheck = Date.now();
  } else {
    status.consecutiveFailures++;
    status.lastCheck = Date.now();
    
    // Mark as unhealthy after 3 consecutive failures
    if (status.consecutiveFailures >= 3 && status.healthy) {
      status.healthy = false;
      console.warn(`❌ RPC #${rpcIndex + 1} marked as unhealthy after ${status.consecutiveFailures} failures`);
      console.warn(`   URL: ${status.url.substring(0, 50)}...`);
      console.warn(`   Error: ${error?.message || 'Unknown error'}`);
      
      // Auto-recover after 30 seconds
      setTimeout(() => {
        console.log(`🔄 Auto-recovering RPC #${rpcIndex + 1} after 30 seconds`);
        status.healthy = true;
        status.consecutiveFailures = 0;
      }, 30000);
    }
  }
}

/**
 * Enhanced forwardRpc function with load balancing and automatic failover.
 * @param {object} payload - JSON-RPC 2.0 request object.
 * @returns {Promise<object>} JSON-RPC 2.0 response object.
 */
async function forwardRpcWithLoadBalancing(payload) {
  // Initialize health status if not already done
  if (rpcHealthStatus.size === 0) {
    initializeRpcHealth();
  }
  
  const maxRetries = config.upstreamRpcUrls.length;
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { url, index } = getNextRpcUrl();
    
    try {
      console.log(`🔄 [${attempt + 1}/${maxRetries}] Using RPC #${index + 1}: ${url.substring(0, 50)}...`);
      
      const response = await forwardRpc(payload, url);
      
      // Mark RPC as healthy on successful response
      updateRpcHealth(index, true);
      
      return response;
    } catch (error) {
      lastError = error;
      console.error(`❌ RPC #${index + 1} failed:`, error.message);
      
      // Mark RPC as potentially unhealthy
      updateRpcHealth(index, false, error);
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        console.error(`💥 All ${maxRetries} RPC endpoints failed for ${payload.method}`);
        
        return {
          jsonrpc: '2.0',
          id: payload.id,
          error: {
            code: -32603,
            message: `All RPC endpoints failed: ${lastError.message}`,
            data: { 
              attempts: maxRetries,
              lastError: lastError.message 
            }
          }
        };
      }
      
      console.log(`🔄 Retrying with next RPC... (Attempt ${attempt + 2}/${maxRetries})`);
    }
  }
  
  // This should never be reached, but just in case
  throw lastError;
}

/**
 * Get health status of all RPC endpoints
 * @returns {Array} Array of RPC health status objects
 */
function getRpcHealthStatus() {
  const healthData = [];
  
  config.upstreamRpcUrls.forEach((url, index) => {
    const status = rpcHealthStatus.get(index);
    healthData.push({
      index: index + 1,
      url: url.substring(0, 50) + '...',
      healthy: status?.healthy || false,
      consecutiveFailures: status?.consecutiveFailures || 0,
      lastCheck: status?.lastCheck || 0
    });
  });
  
  return healthData;
}

export { 
  forwardRpc, 
  forwardRpcWithLoadBalancing, 
  getRpcHealthStatus,
  initializeRpcHealth 
}; 