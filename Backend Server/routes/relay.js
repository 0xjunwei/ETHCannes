// routes/relay.js
const express = require("express");
const router = express.Router();
const { apiKeyAuth, rateLimiter } = require("../middleware");
const {
  sameChainController,
  burnCrossController,
  relayController,
  gasDropController,
} = require("../controllers/relay");

router.post("/same-chain", apiKeyAuth, rateLimiter, sameChainController);
router.post("/burn-cross", apiKeyAuth, rateLimiter, burnCrossController);
router.post("/relay", apiKeyAuth, rateLimiter, relayController);
router.post("/gas-drop", apiKeyAuth, rateLimiter, gasDropController);

module.exports = { relayRouter: router };
