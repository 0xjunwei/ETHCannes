import dotenv from 'dotenv';
dotenv.config();

export default {
  host: process.env.HOST || 'localhost',
  port: parseInt(process.env.PORT || '8545', 10),
  upstreamRpcUrl: process.env.UPSTREAM_RPC_URL || 'https://arb-sepolia.g.alchemy.com/v2/',
  gasApiEndpoint: process.env.GAS_API_ENDPOINT || 'https://your-gas-api.com/sponsor',
  gasApiKey: process.env.GAS_API_KEY || '',
  alchemyApiKey: process.env.ALCHEMY_API_KEY
}; 