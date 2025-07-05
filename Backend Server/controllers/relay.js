// controllers/relay.js
require("dotenv").config();
const { ethers } = require("ethers");

// ABI fragments for each function
const SAME_CHAIN_ABI = [
  "function sameChainGasToken(address user,uint256 ethGasWei) external",
];
const BURN_CROSS_ABI = [
  "function depositForBurnCrossChain(address user,uint256 amount,uint32 destinationDomain,uint256 maxFee,uint32 minFinalityThreshold) external",
];
const MESSAGE_RELAY_ABI = [
  "function relayGasMessage(address,uint256,uint32,bytes32,uint32) external",
];
const EVENT_ABI = ["event MessageSent(bytes message)"];
const RELAY_ABI = [
  "function relayReceive(bytes,bytes) external returns (bool)",
];

// helper to wait
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// helper to poll Circle Iris for attestation
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

// 1️⃣ /api/same-chain
exports.sameChainController = async (req, res) => {
  try {
    const { user, eth } = req.body;
    if (!ethers.isAddress(user) || !eth) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const provider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL
    );
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const vault = new ethers.Contract(
      process.env.ARB_VAULT,
      SAME_CHAIN_ABI,
      wallet
    );
    const ethWei = ethers.parseEther(eth.toString());

    const tx = await vault.sameChainGasToken(user, ethWei);
    const receipt = await tx.wait();

    res.json({ ok: true, txHash: tx.hash, block: receipt.blockNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 2️⃣ /api/burn-cross
exports.burnCrossController = async (req, res) => {
  try {
    const { user, amount, dest, maxFee, minFinality } = req.body;
    if (
      !ethers.isAddress(user) ||
      !amount ||
      !dest ||
      !maxFee ||
      !minFinality
    ) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // ── 1) Submit depositForBurnCrossChain on Arbitrum ────────────────────────
    const arbProvider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL
    );
    const arbWallet = new ethers.Wallet(process.env.PRIVATE_KEY, arbProvider);
    const arbVault = new ethers.Contract(
      process.env.ARB_VAULT,
      BURN_CROSS_ABI,
      arbWallet
    );

    // parse USDC inputs (6 decimals)
    const usdcAmt = ethers.parseUnits(amount.toString(), 6);
    const feeAmt = ethers.parseUnits(maxFee.toString(), 6);

    const tx = await arbVault.depositForBurnCrossChain(
      user,
      usdcAmt,
      Number(dest),
      feeAmt,
      Number(minFinality)
    );
    const receipt = await tx.wait();

    // ── 2) Extract the raw CCTP message from MessageSent event ───────────────
    const sentIface = new ethers.Interface(EVENT_ABI);
    let rawMessage;
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() ===
        process.env.MESSAGE_TRANSMITTER.toLowerCase()
      ) {
        rawMessage = sentIface.parseLog(log).args.message;
        break;
      }
    }
    if (!rawMessage) {
      throw new Error("No MessageSent event found");
    }

    // ── 3) Poll Circle Iris for attestation ─────────────────────────────────
    const { message, attestation } = await fetchAttested(
      process.env.SOURCE_DOMAIN_ID,
      tx.hash
    );

    // ── 4) Relay the attested message to Base Sepolia ────────────────────────
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

    // ── Done ─────────────────────────────────────────────────────────────────
    res.json({
      ok: true,
      burnTxHash: tx.hash,
      relayTxHash: tx2.hash,
      blockBurn: receipt.blockNumber,
      blockRelay: (await tx2.wait()).blockNumber,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 3️⃣ /api/relay
exports.relayController = async (req, res) => {
  try {
    const { user, eth, dest, minFinality } = req.body;
    if (!ethers.isAddress(user) || !eth || !dest) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // 1) send CCTP message
    const arb = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL
    );
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, arb);
    const vault = new ethers.Contract(
      process.env.ARB_VAULT,
      MESSAGE_RELAY_ABI,
      wallet
    );
    const ethWei = ethers.parseEther(eth.toString());
    const recipient = ethers.zeroPadValue(process.env.BASE_VAULT, 32);

    const tx = await vault.relayGasMessage(
      user,
      ethWei,
      Number(dest),
      recipient,
      Number(minFinality || 1)
    );
    const receipt = await tx.wait();

    // 2) extract raw message
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

    // 3) poll Iris
    const { message, attestation } = await fetchAttested(
      process.env.SOURCE_DOMAIN_ID,
      tx.hash
    );

    // 4) relay on Base
    const base = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
    const baseW = new ethers.Wallet(process.env.PRIVATE_KEY, base);
    const baseVault = new ethers.Contract(
      process.env.BASE_VAULT,
      RELAY_ABI,
      baseW
    );
    await baseVault.relayReceive(message, attestation);

    res.json({ ok: true, txHash: tx.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
