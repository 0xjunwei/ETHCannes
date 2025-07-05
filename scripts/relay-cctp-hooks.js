require("dotenv").config();

const { ethers } = require("ethers");
const fetch = require("node-fetch");

// Adjust as per needed
const USER_ADDRESS = "0x56BC54Ad0A2470336220E4204f14B512766b5410";
const ETH_GAS_WEI = ethers.parseEther("0.001");
const MIN_FINALITY = 1000;

// Deployed as the same address throughout no adjustment needed, using create2
const MESSAGE_TRANSMITTER_ADDRESS =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

// pulling from env
const {
  ARBITRUM_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
  PRIVATE_KEY,
  ARB_VAULT,
  BASE_VAULT,
  SOURCE_DOMAIN_ID,
  DEST_DOMAIN,
} = process.env;

// Polling parameters
const POLL_INTERVAL_MS = 3_000;
const MAX_ATTEMPTS = 20;

// ABI
const MESSAGE_RELAY_ABI = [
  "function relayGasMessage(address user,uint256 ethGasWei,uint32 destinationDomain,bytes32 vaultRecipient,uint32 minFinalityThreshold) external",
];
const EVENT_ABI = ["event MessageSent(bytes message)"];
const RELAY_ABI = [
  "function relayReceive(bytes message, bytes attestation) external returns (bool)",
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAttested(domainId, txHash) {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${domainId}?transactionHash=${txHash}`;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    console.log(`Iris poll ${i}/${MAX_ATTEMPTS}...`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const { messages } = await res.json();
        if (messages?.length) {
          const { attestation, status } = messages[0];
          console.log(`Iris status: ${status}`);
          if (attestation?.startsWith("0x")) {
            console.log("Attestation ready");
            return messages[0];
          }
        }
      } else {
        console.warn(`Iris returned ${res.status}`);
      }
    } catch (err) {
      console.warn("Iris fetch error:", err.message);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("No valid attestation after max attempts");
}

// main
(async () => {
  // Connect to Arbitrum and get Vault
  console.log("🔗 Connecting to Arbitrum Sepolia...");
  const arbProvider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC_URL);
  const arbWallet = new ethers.Wallet(PRIVATE_KEY, arbProvider);
  const arbVault = new ethers.Contract(ARB_VAULT, MESSAGE_RELAY_ABI, arbWallet);

  // Prepare the recipient for messaging
  const vaultRecipient = ethers.zeroPadValue(BASE_VAULT, 32);

  // call the message relay
  console.log("Calling relayGasMessage...");
  const tx = await arbVault.relayGasMessage(
    USER_ADDRESS,
    ETH_GAS_WEI,
    Number(DEST_DOMAIN),
    vaultRecipient,
    MIN_FINALITY
  );
  console.log("Tx sent, hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Included in block", receipt.blockNumber);

  // Extract the MessageSent event from the CCTP transmitter
  console.log("Looking for MessageSent from transmitter…");
  const iface = new ethers.Interface(EVENT_ABI);
  let rawMessage;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MESSAGE_TRANSMITTER_ADDRESS.toLowerCase())
      continue;
    try {
      rawMessage = iface.parseLog(log).args.message;
      break;
    } catch {}
  }
  if (!rawMessage) {
    console.error("No MessageSent event from transmitter");
    process.exit(1);
  }
  console.log("Raw message:", rawMessage);

  // Poll Iris for attestation
  const { message, attestation } = await fetchAttested(
    SOURCE_DOMAIN_ID,
    tx.hash
  );

  // Relay on Base
  console.log("Connecting to Base Sepolia...");
  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const baseWallet = new ethers.Wallet(PRIVATE_KEY, baseProvider);
  const baseVault = new ethers.Contract(BASE_VAULT, RELAY_ABI, baseWallet);

  console.log("Calling relayReceive…");
  const tx2 = await baseVault.relayReceive(message, attestation);
  // Pending txn before getting hash
  const receipt2 = await tx2.wait();
  console.log("Relay tx:", tx2.hash);

  console.log("Test complete, gas message delivered to your Base vault.");
})().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
