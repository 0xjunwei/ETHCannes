// routes/relay.js
const express = require("express");
const router = express.Router();
const { apiKeyAuth, rateLimiter } = require("../middleware");
const {
  sameChainController,
  burnCrossController,
  relayController,
} = require("../controllers/relay");

router.post("/same-chain", apiKeyAuth, rateLimiter, sameChainController);
router.post("/burn-cross", apiKeyAuth, rateLimiter, burnCrossController);
router.post("/relay", apiKeyAuth, rateLimiter, relayController);

module.exports = { relayRouter: router };
