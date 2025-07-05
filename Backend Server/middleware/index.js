// middleware/index.js
require("dotenv").config();

const validKeys = (process.env.API_KEYS || "").split(",").map((k) => k.trim());

exports.apiKeyAuth = (req, res, next) => {
  // if your client is sending it in `x-api-key`:
  const key = req.headers["x-api-key"];
  if (!key || !validKeys.includes(key)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
};

// a trivial rateLimiter stub
exports.rateLimiter = (req, res, next) => next();
