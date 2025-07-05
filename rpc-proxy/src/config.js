import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

// Get the directory path of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));
// Configure dotenv to look for .env file one directory up
dotenv.config({ path: path.join(__dirname, '../.env') });

export default {
  host: process.env.HOST || 'localhost',
  port: parseInt(process.env.PORT || '8545', 10),
  upstreamRpcUrl: process.env.UPSTREAM_RPC_URL || 'https://arb-sepolia.g.alchemy.com/v2/qBkrQjmVDZgDPlzONjeyC',
  gasApiEndpoint: process.env.GAS_API_ENDPOINT || 'https://your-gas-api.com/sponsor',
  gasApiKey: process.env.GAS_API_KEY || '',
  alchemyApiKey: process.env.ALCHEMY_API_KEY
};