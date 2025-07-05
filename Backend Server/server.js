// server.js
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { relayRouter } = require("./routes/relay");

const app = express();

// Security & parsing
app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  })
);
app.use(express.json());

// Global rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests, please try again later.",
  })
);

// Mount API routes
app.use("/api", relayRouter);

// Bind only to localhost
const PORT = process.env.PORT;
const HOST = process.env.HOST;
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
