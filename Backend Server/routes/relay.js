// routes/relay.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const apiKeyAuth = require("../middleware/auth");
const { relayController } = require("../controllers/relay");

const router = express.Router();

// Limiter just for /relay
const relayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: "Too many relay requests, slow down",
});

router.post("/relay", apiKeyAuth, relayLimiter, relayController);

module.exports = { relayRouter: router };
