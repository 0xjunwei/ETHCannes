// controllers/relay.js
require("dotenv").config();
const { ethers } = require("ethers");

const MESSAGE_RELAY_ABI = [
  "function relayGasMessage(address,uint256,uint32,bytes32,uint32) external",
];
const EVENT_ABI = ["event MessageSent(bytes message)"];
const RELAY_ABI = [
  "function relayReceive(bytes,bytes) external returns (bool)",
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function fetchAttested(domainId, txHash) {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${domainId}?transactionHash=${txHash}`;
  for (let i = 0; i < 20; i++) {
    const res = await fetch(url);
    const { messages } = await res.json();
    if (messages?.[0]?.attestation?.startsWith("0x")) {
      return messages[0];
    }
    await sleep(3000);
  }
  throw new Error("Attestation timeout");
}

exports.relayController = async (req, res) => {
  try {
    const { user, eth, dest, minFinality } = req.body;
    if (!ethers.isAddress(user) || !eth || !dest) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // 1️⃣ Arbitrum side
    const arbProvider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL
    );
    const arbWallet = new ethers.Wallet(process.env.PRIVATE_KEY, arbProvider);
    const arbVault = new ethers.Contract(
      process.env.ARB_VAULT,
      MESSAGE_RELAY_ABI,
      arbWallet
    );
    const ethWei = ethers.parseEther(eth.toString());
    const vaultRecipient = ethers.zeroPadValue(process.env.BASE_VAULT, 32);

    const tx = await arbVault.relayGasMessage(
      user,
      ethWei,
      Number(dest),
      vaultRecipient,
      Number(minFinality || 1)
    );
    const receipt = await tx.wait();

    // 2️⃣ Capture raw message
    const iface = new ethers.Interface(EVENT_ABI);
    let rawMessage;
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() ===
        process.env.MESSAGE_TRANSMITTER.toLowerCase()
      ) {
        rawMessage = iface.parseLog(log).args.message;
        break;
      }
    }
    if (!rawMessage) throw new Error("No MessageSent event");

    // 3️⃣ Iris attestation
    const { message, attestation } = await fetchAttested(
      process.env.SOURCE_DOMAIN_ID,
      tx.hash
    );

    // 4️⃣ Base side relay
    const baseProvider = new ethers.JsonRpcProvider(
      process.env.BASE_SEPOLIA_RPC_URL
    );
    const baseWallet = new ethers.Wallet(process.env.PRIVATE_KEY, baseProvider);
    const baseVault = new ethers.Contract(
      process.env.BASE_VAULT,
      RELAY_ABI,
      baseWallet
    );
    const tx2 = await baseVault.relayReceive(message, attestation);
    await tx2.wait();

    res.json({ ok: true, txHash: tx.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
