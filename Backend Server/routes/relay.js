// routes/relay.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const apiKeyAuth = require("../middleware/auth");
const {
  sameChainController,
  burnCrossController,
  relayController,
} = require("../controllers/relay");

const router = express.Router();

// allow max 5 calls/minute per IP for all relay routes
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many requests, please slow down",
});

// 1️⃣ Same-chain gas drop
router.post(
  "/same-chain", // endpoint path
  apiKeyAuth, // API key check :contentReference[oaicite:0]{index=0}
  limiter, // rate limit
  sameChainController // handler
);

// 2️⃣ Cross-chain USDC → CCTP burn
router.post("/burn-cross", apiKeyAuth, limiter, burnCrossController);

// 3️⃣ Pure CCTP gas-message relay
router.post("/relay", apiKeyAuth, limiter, relayController);

module.exports = { relayRouter: router };
