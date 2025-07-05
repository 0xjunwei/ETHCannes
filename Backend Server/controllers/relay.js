// controllers/relay.js
require("dotenv").config();
const { ethers } = require("ethers");
const fetch = global.fetch || require("node-fetch");
const chainConfig = require("../config/chains");

// ABIs
const SAME_CHAIN_ABI = ["function sameChainGasToken(address,uint256) external"];
const BURN_CROSS_ABI = [
  "function depositForBurnCrossChain(address,uint256,uint32,uint256,uint32) external",
];
const MESSAGE_RELAY_ABI = [
  "function relayGasMessage(address,uint256,uint32,bytes32,uint32) external",
];
const EVENT_ABI = ["event MessageSent(bytes message)"];
const RELAY_ABI = ["function relayReceive(bytes,bytes) external returns(bool)"];
const GAS_DROP_ABI = [
  "function gasDrop(address user,uint256 ethGasWei) external",
];
// Polling parameters
const POLL_INTERVAL = 3_000; // 3s
const MAX_POLLS_FAST = 20; // ~1m
const MAX_POLLS_SLOW = 400; // ~20m

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchIris(domain, txHash) {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${domain}?transactionHash=${txHash}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.messages) ? j.messages : [];
  } catch {
    return [];
  }
}

async function waitForNonce(domain, txHash, nonce, maxPolls) {
  for (let i = 1; i <= maxPolls; i++) {
    const msgs = await fetchIris(domain, txHash);
    const found = msgs.find(
      (m) =>
        m.eventNonce === nonce &&
        typeof m.attestation === "string" &&
        m.attestation.startsWith("0x")
    );
    if (found) return found;
    await sleep(POLL_INTERVAL);
  }
  throw new Error(`timeout waiting for iris nonce=${nonce}`);
}

// ── 1️⃣ same‐chain gas drop ─────────────────────────────────────────────────
exports.sameChainController = async (req, res) => {
  try {
    const { user, eth, src } = req.body;
    if (!ethers.isAddress(user) || !eth || !chainConfig[src]) {
      return res.status(400).json({ error: "Invalid parameters or chain" });
    }
    const { rpc, vault } = chainConfig[src];
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const c = new ethers.Contract(vault, SAME_CHAIN_ABI, wallet);

    const ethWei = ethers.parseEther(eth.toString());
    const tx = await c.sameChainGasToken(user, ethWei);
    const rcpt = await tx.wait();

    return res.json({ ok: true, txHash: tx.hash, block: rcpt.blockNumber });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ── 2️⃣ USDC burn‐and‐bridge cross‐chain ─────────────────────────────────────
exports.burnCrossController = async (req, res) => {
  try {
    const { user, amount, src, dst, maxFee, minFinality } = req.body;
    if (
      !ethers.isAddress(user) ||
      !amount ||
      !chainConfig[src] ||
      !chainConfig[dst] ||
      !maxFee ||
      !minFinality
    ) {
      return res.status(400).json({ error: "Invalid parameters or chains" });
    }

    const { rpc, vault, domainId } = chainConfig[src];
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const c = new ethers.Contract(vault, BURN_CROSS_ABI, wallet);

    // USDC = 6 decimals
    const usdcAmt = ethers.parseUnits(amount.toString(), 6);
    const feeAmt = ethers.parseUnits(maxFee.toString(), 6);

    const tx = await c.depositForBurnCrossChain(
      user,
      usdcAmt,
      chainConfig[dst].domainId,
      feeAmt,
      Number(minFinality)
    );
    const rcpt = await tx.wait();

    // extract raw CCTP message
    const iface = new ethers.Interface(EVENT_ABI);
    const log = rcpt.logs.find(
      (l) =>
        l.address.toLowerCase() ===
        process.env.MESSAGE_TRANSMITTER.toLowerCase()
    );
    if (!log) throw new Error("No MessageSent event");
    const raw = iface.parseLog(log).args.message;

    // wait up to ~20m for attestation
    const { message, attestation } = await waitForNonce(
      domainId,
      tx.hash,
      iface.parseLog(log).args.message,
      MAX_POLLS_SLOW
    );

    // relayReceive on destination
    const { rpc: dstRpc, vault: dstVault } = chainConfig[dst];
    const dstProv = new ethers.JsonRpcProvider(dstRpc);
    const dstW = new ethers.Wallet(process.env.PRIVATE_KEY, dstProv);
    const dstC = new ethers.Contract(dstVault, RELAY_ABI, dstW);

    const tx2 = await dstC.relayReceive(message, attestation);
    const rcpt2 = await tx2.wait();

    return res.json({
      ok: true,
      burnTxHash: tx.hash,
      relayTxHash: tx2.hash,
      blockBurn: rcpt.blockNumber,
      blockRelay: rcpt2.blockNumber,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ── 3️⃣ combined USDC‐bridge + gas‐hook message ────────────────────────────
exports.relayController = async (req, res) => {
  try {
    const { user, eth, src, dst, minFinality } = req.body;
    if (
      !ethers.isAddress(user) ||
      !eth ||
      !chainConfig[src] ||
      !chainConfig[dst]
    ) {
      return res.status(400).json({ error: "Invalid params or chains" });
    }

    // 1) fire combined relayGasMessage on src
    const {
      rpc: srcRpc,
      vault: srcVault,
      domainId: srcDomain,
    } = chainConfig[src];
    const srcProv = new ethers.JsonRpcProvider(srcRpc);
    const srcW = new ethers.Wallet(process.env.PRIVATE_KEY, srcProv);
    const srcC = new ethers.Contract(srcVault, MESSAGE_RELAY_ABI, srcW);

    const ethWei = ethers.parseEther(eth.toString());
    const recipient32 = ethers.zeroPadValue(chainConfig[dst].vault, 32);

    const tx = await srcC.relayGasMessage(
      user,
      ethWei,
      chainConfig[dst].domainId,
      recipient32,
      Number(minFinality || 1)
    );
    const rcpt = await tx.wait();

    // 2) count and extract the two raw messages
    const emitter = process.env.MESSAGE_TRANSMITTER.toLowerCase();
    const logs = rcpt.logs.filter((l) => l.address.toLowerCase() === emitter);
    if (logs.length < 2) {
      throw new Error(`Expected ≥2 MessageSent logs, got ${logs.length}`);
    }
    console.log(`→ saw ${logs.length} MessageSent event(s)`);

    // 3) wait until Iris shows at least that many messages
    console.log("⏳ waiting for Iris to surface messages…");
    let irisMsgs = [];
    for (let i = 0; i < MAX_POLLS_FAST; i++) {
      irisMsgs = await fetchIris(srcDomain, tx.hash);
      if (irisMsgs.length >= logs.length) break;
      await sleep(POLL_INTERVAL);
    }
    if (irisMsgs.length < logs.length) {
      throw new Error(`Iris only returned ${irisMsgs.length} messages`);
    }
    console.log(`→ Iris returned ${irisMsgs.length} message(s)`);

    // split them: fast = index 1, slow = index 0
    const fast = irisMsgs[1],
      slow = irisMsgs[0];

    // 4) relay the fast hook immediately
    console.log("⏳ relaying fast gas‐hook…");
    if (!fast.attestation.startsWith("0x")) {
      Object.assign(
        fast,
        await waitForNonce(srcDomain, tx.hash, fast.eventNonce, MAX_POLLS_FAST)
      );
    }
    const { rpc: dstRpc, vault: dstVault } = chainConfig[dst];
    const dstProv = new ethers.JsonRpcProvider(dstRpc);
    const dstW = new ethers.Wallet(process.env.PRIVATE_KEY, dstProv);
    const dstC = new ethers.Contract(dstVault, RELAY_ABI, dstW);

    const txFast = await dstC.relayReceive(fast.message, fast.attestation);
    await txFast.wait();
    console.log("→ fast relayed:", txFast.hash);

    // 5) reply to client right away
    res.json({
      ok: true,
      hookRelayedTx: txFast.hash,
      bridgeMessage: slow.message, // let them track the slow one by its raw message
    });

    // 6) in background, relay the USDC bridge
    (async () => {
      try {
        console.log("⏳ [bg] waiting for USDC‐bridge…");
        if (!slow.attestation.startsWith("0x")) {
          Object.assign(
            slow,
            await waitForNonce(
              srcDomain,
              tx.hash,
              slow.eventNonce,
              MAX_POLLS_SLOW
            )
          );
        }
        console.log("→ [bg] relaying USDC‐bridge…");
        const txSlow = await dstC.relayReceive(slow.message, slow.attestation);
        await txSlow.wait();
        console.log("✅ [bg] USDC‐bridge relayed:", txSlow.hash);
      } catch (bgErr) {
        console.error("❌ [bg] USDC bridge failed:", bgErr);
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.gasDropController = async (req, res) => {
  try {
    const { user, eth, src } = req.body;
    if (!ethers.isAddress(user) || !eth || !chainConfig[src]) {
      return res.status(400).json({ error: "Invalid parameters or chain" });
    }

    const { rpc, vault } = chainConfig[src];
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const c = new ethers.Contract(vault, GAS_DROP_ABI, wallet);

    const ethWei = ethers.parseEther(eth.toString());
    const tx = await c.gasDrop(user, ethWei);
    const rcpt = await tx.wait();

    return res.json({
      ok: true,
      txHash: tx.hash,
      block: rcpt.blockNumber,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
