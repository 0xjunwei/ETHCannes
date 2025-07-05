// scripts/authorize-both-vaults.js
require("dotenv").config();
const { ethers } = require("ethers");

const {
  ARBITRUM_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
  PRIVATE_KEY,
  ARB_VAULT,
  BASE_VAULT,
} = process.env;

// ABI for the setAuthorizedVault function
const VAULT_ABI = [
  "function setAuthorizedVault(address vaultAddr, bool authorized) external",
];

(async () => {
  // Helper to authorize peerVault on a given chain
  async function authorizeOnChain(rpcUrl, vaultAddress, peerVault) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);

    console.log(`\n🔗 Authorizing on ${rpcUrl}`);
    console.log(` • Vault:      ${vaultAddress}`);
    console.log(` • Peer Vault: ${peerVault}`);
    const tx = await vault.setAuthorizedVault(peerVault, true);
    console.log(" → tx hash:", tx.hash);
    await tx.wait();
    console.log(" ✅ authorized");
  }

  // 1️⃣ Arbitrum: authorize BaseVault
  await authorizeOnChain(ARBITRUM_SEPOLIA_RPC_URL, ARB_VAULT, BASE_VAULT);

  // 2️⃣ Base: authorize ArbitrumVault
  await authorizeOnChain(BASE_SEPOLIA_RPC_URL, BASE_VAULT, ARB_VAULT);

  console.log("\n🎉 Both vaults are now mutually authorized!");
})();
