# Gas Out RPC Proxy

A lightweight JSON-RPC proxy that

1. Receives wallet RPC calls from the Gas Out browser extension
2. Holds `eth_sendTransaction` requests
3. Calls your Gas Sponsor API to top-up / sponsor the user's gas fee
4. Forwards the original JSON-RPC call to an upstream provider (Infura, Alchemy, QuickNode, etc.)

## Project structure

```
rpc-proxy/
├── env.example            # Copy to `.env` and fill in values
├── package.json           # Node.js dependencies & scripts
└── src
    ├── index.js           # Main Express server & request pipeline
    ├── config.js          # Loads environment variables via dotenv
    ├── sponsor.js         # Helper that calls the Gas Sponsor API
    └── forwarder.js       # Helper that forwards JSON-RPC payloads to upstream
```

### File responsibilities

* **src/index.js** – HTTP server exposing a single POST `/` endpoint. It validates incoming JSON-RPC payloads, triggers gas sponsorship for `eth_sendTransaction`, then forwards the call to the upstream RPC and returns the upstream response unchanged.
* **src/config.js** – Central place for environment variables (host, port, upstream RPC URL, sponsor API settings).
* **src/sponsor.js** – Encapsulates the HTTP call to your Gas Sponsor API. Accepts a tx object & chainId, returns the API response.
* **src/forwarder.js** – Thin wrapper around Axios that POSTs any JSON-RPC payload to `UPSTREAM_RPC_URL`.

## Quick start

```bash
# 1. Navigate to the proxy directory
cd rpc-proxy

# 2. Install dependencies
npm install

# 3. Copy env file and edit values
cp env.example .env
# ➜ Edit .env with your Infura/Alchemy URL, sponsor API endpoint & key.

# 4. Run the proxy
npm run dev   # uses nodemon for auto-reload
#   ‑ or ‑
npm start     # plain node
```

By default the proxy listens on `http://localhost:8545` – update `PORT` / `HOST` in `.env` if needed.

## How it works

1. The extension is configured to point Metamask's provider at `http://localhost:8545` (this proxy).
2. When a DApp calls `eth_sendTransaction`, the proxy first performs:
   ```js
   sponsorGas(tx, chainId)
   ```
   which POSTs to `GAS_API_ENDPOINT` together with user address, gas amount, etc.
3. Once the sponsor API responds **successfully**, the proxy forwards the original JSON-RPC call to `UPSTREAM_RPC_URL`.
4. The upstream node mines/broadcasts the tx; the proxy passes its response straight back to the extension/DApp.

## Production notes

* This reference implementation keeps no persistent storage – every tx is processed in-memory.
* For scale, consider adding a queue, timeout/retry logic, and caching the Sponsored balance per address.
* Enable HTTPS and CORS hardening before putting the proxy on a public network. 