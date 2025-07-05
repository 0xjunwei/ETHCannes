// middleware/auth.js
require("dotenv").config();
const validApiKeys = new Set((process.env.API_KEYS || "").split(","));

module.exports = function apiKeyAuth(req, res, next) {
  const key = req.header("x-api-key");
  if (!key || !validApiKeys.has(key)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
};
