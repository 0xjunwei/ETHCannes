// scripts/relay-gas-message.js
require("dotenv").config();
const { ethers } = require("ethers");
// if you’re on Node ≤17 uncomment:
// const fetch = require("node-fetch");

////////////////////////////////////////////////////////////////////////////////
// CONFIG
////////////////////////////////////////////////////////////////////////////////
const {
  ARBITRUM_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
  PRIVATE_KEY,
  ARB_VAULT,
  BASE_VAULT,
  SOURCE_DOMAIN_ID,
  DEST_DOMAIN,
  MESSAGE_TRANSMITTER_ADDRESS,
} = process.env;

const USER_ADDRESS = "0x56BC54Ad0A2470336220E4204f14B512766b5410";
const ETH_GAS_WEI = ethers.parseEther("0.001");
const MIN_FINALITY = 1000;

const VAULT_ABI = [
  "function relayGasMessage(address,uint256,uint32,bytes32,uint32) external",
];
const MESSAGE_ABI = ["event MessageSent(bytes message)"];
const RELAY_ABI = ["function relayReceive(bytes,bytes) external returns(bool)"];

const POLL_INTERVAL = 3_000; // 3s
const MAX_POLLS_FAST = 20; // ~1m for fast hook
const MAX_POLLS_SLOW = 400; // ~20m for USDC

////////////////////////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////////////////////////
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

// wait until the given nonce has a real attestation
async function waitFor(domain, txHash, nonce, maxPolls) {
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
  throw new Error(`timeout waiting for nonce=${nonce}`);
}

////////////////////////////////////////////////////////////////////////////////
// MAIN
////////////////////////////////////////////////////////////////////////////////
(async () => {
  // 1) fire the combined call on Arbitrum
  console.log("⏳ Sending relayGasMessage on Arbitrum...");
  const arb = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC_URL);
  const aw = new ethers.Wallet(PRIVATE_KEY, arb);
  const av = new ethers.Contract(ARB_VAULT, VAULT_ABI, aw);
  const recv = ethers.zeroPadValue(BASE_VAULT, 32);

  const tx = await av.relayGasMessage(
    USER_ADDRESS,
    ETH_GAS_WEI,
    Number(DEST_DOMAIN),
    recv,
    MIN_FINALITY
  );
  const rcp = await tx.wait();
  console.log("→ Arbitrum TX:", tx.hash);

  // 2) count how many MessageSent events we emitted
  const emitter = MESSAGE_TRANSMITTER_ADDRESS.toLowerCase();
  const logs = rcp.logs.filter((l) => l.address.toLowerCase() === emitter);
  console.log(`→ saw ${logs.length} MessageSent event(s)`);

  // 3) fetch Iris until we get at least that many messages
  console.log("⏳ Waiting for Iris to surface messages…");
  let iris;
  for (let i = 0; i < MAX_POLLS_FAST; i++) {
    iris = await fetchIris(SOURCE_DOMAIN_ID, tx.hash);
    if (iris.length >= logs.length) break;
    await sleep(POLL_INTERVAL);
  }
  if ((iris || []).length < logs.length) {
    console.error("✖ Iris only returned", (iris || []).length);
    process.exit(1);
  }
  console.log("→ Iris returned", iris.length, "message(s)");

  // split fast (index 1) vs slow (index 0)
  const fast = iris[1],
    slow = iris[0];

  // 4) relay the fast hook ASAP (short poll)
  console.log("⏳ Relaying fast gas-hook…");
  if (!fast.attestation.startsWith("0x")) {
    Object.assign(
      fast,
      await waitFor(SOURCE_DOMAIN_ID, tx.hash, fast.eventNonce, MAX_POLLS_FAST)
    );
  }
  const base = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const bw = new ethers.Wallet(PRIVATE_KEY, base);
  const bv = new ethers.Contract(BASE_VAULT, RELAY_ABI, bw);
  const txF = await bv.relayReceive(fast.message, fast.attestation);
  await txF.wait();
  console.log("→ fast relayed:", txF.hash);

  // 5) relay the USDC bridge (long poll)
  console.log("⏳ Relaying USDC-bridge…");
  if (!slow.attestation.startsWith("0x")) {
    Object.assign(
      slow,
      await waitFor(SOURCE_DOMAIN_ID, tx.hash, slow.eventNonce, MAX_POLLS_SLOW)
    );
  }
  const txS = await bv.relayReceive(slow.message, slow.attestation);
  await txS.wait();
  console.log("→ bridge relayed:", txS.hash);

  console.log("🎉 All done!");
})().catch((err) => {
  console.error("❌ Error:", err.message || err);
  process.exit(1);
});
