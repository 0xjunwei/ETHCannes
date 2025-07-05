// server.js
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { relayRouter } = require("./routes/relay");

const app = express();

app.use(helmet());
app.use(cors({ origin: ["http://127.0.0.1:3000"] }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// mount all three of your endpoints under /api
app.use("/api", relayRouter);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server listening on http://${HOST}:${PORT}/api`);
});
