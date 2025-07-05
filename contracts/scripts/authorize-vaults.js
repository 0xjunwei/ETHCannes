// scripts/authorize-vaults.js
require("dotenv").config();
const { ethers } = require("ethers");

// grab your vaults & RPCs from .env
const vaults = [
  {
    name: "Arbitrum Sepolia",
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    address: process.env.ARB_VAULT,
  },
  {
    name: "Base Sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC_URL,
    address: process.env.BASE_VAULT,
  },
  {
    name: "Optimism Sepolia",
    rpc: process.env.OP_SEPOLIA_RPC_URL,
    address: process.env.OP_VAULT,
  },
];

const VAULT_ABI = [
  "function setAuthorizedVault(address vaultAddr, bool authorized) external",
];

async function authorizeOnChain(rpcUrl, vaultAddr, peerVaultAddr) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);

  console.log(`\n🔗 Authorizing on ${vaultAddr}`);
  console.log(` • peer vault: ${peerVaultAddr}`);
  const tx = await vault.setAuthorizedVault(peerVaultAddr, true);
  console.log(` → tx hash: ${tx.hash}`);
  await tx.wait();
  console.log(" ✅ done");
}

(async () => {
  for (let i = 0; i < vaults.length; i++) {
    const src = vaults[i];
    for (let j = 0; j < vaults.length; j++) {
      if (i === j) continue;
      const dst = vaults[j];
      console.log(`\n=== ${src.name} authorizes ${dst.name} ===`);
      await authorizeOnChain(src.rpc, src.address, dst.address);
    }
  }
  console.log("\n🎉 All vaults are now mutually authorized!");
})().catch((err) => {
  console.error("❌ Authorization script failed:", err);
  process.exit(1);
});
