require('dotenv').config();

module.exports = {
  host: process.env.HOST || 'localhost',
  port: parseInt(process.env.PORT || '8545', 10),
  upstreamRpcUrl: process.env.UPSTREAM_RPC_URL,
  gasApiEndpoint: process.env.GAS_API_ENDPOINT || 'https://your-gas-api.com/sponsor',
  gasApiKey: process.env.GAS_API_KEY || '',
}; 