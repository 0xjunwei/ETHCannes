require("dotenv").config();
const { ethers } = require("ethers");

(async () => {
  const {
    ARBITRUM_SEPOLIA_RPC_URL,
    PRIVATE_KEY2, // your "user" key to approve from
    USDC_ADDRESS,
    ARB_VAULT, // the Vault contract address
  } = process.env;

  if (!PRIVATE_KEY2) {
    console.error(
      "set PRIVATE_KEY2 in .env to the user wallet that holds USDC"
    );
    process.exit(1);
  }

  // Connect as your user
  const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC_URL);
  const wallet2 = new ethers.Wallet(PRIVATE_KEY2, provider);

  // Attach to the USDC token (6-decimals)
  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    [
      "function approve(address spender, uint256 amount) external returns (bool)",
    ],
    wallet2
  );

  // Approving this amount
  const amount = ethers.parseUnits("1000", 6);

  console.log(
    `Approving ${ethers.formatUnits(amount, 6)} USDC to Vault at ${ARB_VAULT}...`
  );
  const tx = await usdc.approve(ARB_VAULT, amount);
  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("Approved");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
