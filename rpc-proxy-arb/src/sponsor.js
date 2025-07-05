const axios = require('axios');
const { gasApiEndpoint, gasApiKey } = require('./config');

/**
 * Requests gas sponsorship for a pending transaction.
 * @param {object} tx - The transaction object as received via JSON-RPC `eth_sendTransaction`.
 * @param {string} chainId - The chain ID (hex string) of the network.
 * @returns {Promise<object>} Sponsorship API response data
 */
async function sponsorGas(tx, chainId) {
  const payload = {
    userAddress: tx.from,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gasAmount: tx.gas,
    chainId,
    timestamp: Date.now(),
  };

  const headers = { 'Content-Type': 'application/json' };
  if (gasApiKey) {
    headers['Authorization'] = `Bearer ${gasApiKey}`;
  }

  const res = await axios.post(gasApiEndpoint, payload, { headers });
  return res.data;
}

module.exports = { sponsorGas }; 