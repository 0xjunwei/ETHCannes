// config/chains.js
module.exports = {
  arbitrum: {
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    vault: process.env.ARB_VAULT,
    domainId: Number(process.env.ARB_DOMAIN_ID),
  },
  base: {
    rpc: process.env.BASE_SEPOLIA_RPC_URL,
    vault: process.env.BASE_VAULT,
    domainId: Number(process.env.BASE_DOMAIN_ID),
  },
  optimism: {
    rpc: process.env.OPTIMISM_RPC_URL,
    vault: process.env.OPTIMISM_VAULT,
    domainId: Number(process.env.OPTIMISM_DOMAIN_ID),
  },
};
