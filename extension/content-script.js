// content-script.js
const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex
const LOCAL_RPC_URL = 'http://localhost:8545';

// Create a proxy to handle both real and spoofed balance requests
function createCustomProvider(ethereum) {
  const originalProvider = ethereum;
  
  return new Proxy(ethereum, {
    get: function(target, prop) {
      if (prop === 'request') {
        return async function(payload) {
          // Handle different types of requests
          if (payload.method === 'eth_getBalance') {
            // Create two separate requests for real and spoofed balances
            const [realBalance, spoofedBalance] = await Promise.all([
              // Real balance request
              fetch(LOCAL_RPC_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-balance-type': 'real'
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: Date.now(),
                  method: 'eth_getBalance',
                  params: payload.params
                })
              }).then(r => r.json()),
              // Spoofed balance request
              fetch(LOCAL_RPC_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-balance-type': 'spoof'
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: Date.now(),
                  method: 'eth_getBalance',
                  params: payload.params
                })
              }).then(r => r.json())
            ]);

            // Store both balances in window for UI access
            window.ethBalances = {
              real: realBalance.result,
              spoofed: spoofedBalance.result
            };

            // Return the spoofed balance for contract interactions
            return spoofedBalance.result;
          }
          
          // For all other requests, use the original provider
          return originalProvider.request(payload);
        };
      }
      return target[prop];
    }
  });
}

// Notify that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });

// Listen for configuration messages
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === 'CONFIGURE_METAMASK_NETWORK') {
    try {
      // Check if ethereum object exists
      if (!window.ethereum) {
        throw new Error('MetaMask not detected');
      }

      // Inject our custom provider
      window.ethereum = createCustomProvider(window.ethereum);

      // Request permission to access ethereum
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Add/switch to our custom network configuration
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Sepolia (Gas Out)',
          nativeCurrency: {
            name: 'ETH',
            symbol: 'ETH',
            decimals: 18
          },
          rpcUrls: [LOCAL_RPC_URL],
          blockExplorerUrls: ['https://sepolia.etherscan.io']
        }]
      });

      // Switch to the network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }]
      });

      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to configure MetaMask:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  }
});
