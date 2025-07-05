// scripts/add-authorized-interactive.js
require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

// Minimal ABI for the helper
const ABI = ["function addAuthorizedCaller(address account) external"];

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async () => {
  try {
    // Gather inputs
    const rpcUrl = await prompt("RPC URL: ");
    const vaultAddr = await prompt("Vault address: ");
    const account = await prompt("Address to authorize: ");

    if (!rpcUrl) {
      console.error("RPC URL is required");
      process.exit(1);
    }
    if (!ethers.isAddress(vaultAddr)) {
      console.error("Invalid vault address");
      process.exit(1);
    }
    if (!ethers.isAddress(account)) {
      console.error("Invalid account");
      process.exit(1);
    }

    // Setup provider & signer
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error("❌ PRIVATE_KEY not set in .env");
      process.exit(1);
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Instantiate Vault contract
    const vault = new ethers.Contract(vaultAddr, ABI, wallet);

    // Send transaction
    console.log(`Granting AUTHORIZED role to ${account}...`);
    const tx = await vault.addAuthorizedCaller(account);
    console.log("tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log(`Success! Included in block ${receipt.blockNumber}`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
