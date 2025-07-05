require("dotenv").config();
const { ethers } = require("ethers");
const fetch = global.fetch || require("node-fetch");

const {
  ARBITRUM_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
  SOURCE_DOMAIN_ID,
  MESSAGE_TRANSMITTER_ADDRESS,
  PRIVATE_KEY,
} = process.env;

// Adjust the hash
const TX_HASH =
  "0x8635dcd73fc362ed2843e3074ace9b40fd6c95930a3b147ff7778b20fa1ed15a";

// Polling parameters
const POLL_INTERVAL_MS = 50_00; // 5s
const MAX_ATTEMPTS = 20;

// ABI
const EVENT_ABI = ["event MessageSent(bytes message)"];
const MT_ABI = [
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll Iris until we get a real attestation
async function fetchAttestedMessage(domainId, txHash) {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${domainId}?transactionHash=${txHash}`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `🔎 [${attempt}/${MAX_ATTEMPTS}] Checking Iris for attestation...`
    );
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(
          `Iris returned ${res.status}, retrying in ${POLL_INTERVAL_MS / 1000}s`
        );
      } else {
        const { messages } = await res.json();
        if (Array.isArray(messages) && messages.length) {
          const { status, message, attestation } = messages[0];
          console.log(`Iris status: ${status}`);
          if (typeof attestation === "string" && attestation.startsWith("0x")) {
            console.log("Valid attestation received");
            return { message, attestation };
          }
        }
      }
    } catch (err) {
      console.warn("Polling error:", err.message);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`No valid attestation after ${MAX_ATTEMPTS} attempts`);
}

(async () => {
  try {
    // 1️⃣ Pull the raw CCTP message bytes from the on-chain event
    console.log("📡 Connecting to source RPC...");
    const srcProvider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC_URL);
    const receipt = await srcProvider.getTransactionReceipt(TX_HASH);
    if (!receipt) throw new Error("Source transaction not found");

    const iface = new ethers.Interface(EVENT_ABI);
    let rawMessage;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        rawMessage = parsed.args.message;
        break;
      } catch {
        // not the MessageSent event
      }
    }
    if (!rawMessage) throw new Error("MessageSent event not found");
    console.log("✅ Extracted raw message");

    // Poll Iris until attestation is truly ready
    const { message, attestation } = await fetchAttestedMessage(
      SOURCE_DOMAIN_ID,
      TX_HASH
    );

    //Relay on the destination chain
    console.log("Connecting to destination RPC...");
    const dstProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
    const relayer = new ethers.Wallet(PRIVATE_KEY, dstProvider);
    const mt = new ethers.Contract(
      MESSAGE_TRANSMITTER_ADDRESS,
      MT_ABI,
      relayer
    );

    console.log("Calling receiveMessage...");
    const tx = await mt.receiveMessage(message, attestation);
    console.log("Relay tx hash:", tx.hash);
    const receipt2 = await tx.wait();
    console.log("Relay succeeded at block", receipt2.blockNumber);
  } catch (err) {
    console.error("Error during relay:", err);
    process.exit(1);
  }
})();
