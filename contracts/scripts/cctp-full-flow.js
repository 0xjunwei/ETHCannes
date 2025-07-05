require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");

// Vault ABI
const vaultAbi = JSON.parse(
  fs.readFileSync("artifacts/contracts/Vault.sol/Vault.json")
).abi;

const usdcAbi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const {
  ARBITRUM_SEPOLIA_RPC_URL,
  PRIVATE_KEY, // deployer / vault-controller
  PRIVATE_KEY2, // user
  USER_ADDRESS,
  VAULT_ADDRESS,
  TOKEN_MESSENGER_ADDRESS,
  USDC_ADDRESS,
  DEST_DOMAIN,
} = process.env;

async function main() {
  console.log("CCTP V2 full two-step positive flow");

  const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC_URL);
  const vaultController = new ethers.Wallet(PRIVATE_KEY, provider);
  const userSigner = new ethers.Wallet(PRIVATE_KEY2, provider);

  const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi, vaultController);
  const usdcUser = new ethers.Contract(USDC_ADDRESS, usdcAbi, userSigner);

  const amount = ethers.parseUnits("1", 6); // 1 USDC trial, lack of usdc from faucet
  const approvalAmount = ethers.parseUnits("1000000", 6); // 1 000 000 USDC allowance

  // user approves and depositUserFunds()
  const balRaw = await usdcUser.balanceOf(USER_ADDRESS);
  const allowRaw = await usdcUser.allowance(USER_ADDRESS, VAULT_ADDRESS);
  const bal = BigInt(balRaw.toString());
  const allow = BigInt(allowRaw.toString());

  console.log(`User balance:  ${ethers.formatUnits(balRaw, 6)} USDC`);
  console.log(`User allowance: ${ethers.formatUnits(allowRaw, 6)} USDC`);

  if (bal < amount) {
    throw new Error("User has insufficient USDC");
  }
  if (allow < amount) {
    console.log("Approving Vault to pull user’s USDC…");
    await (await usdcUser.approve(VAULT_ADDRESS, approvalAmount)).wait();
    console.log("Vault approved");
  }

  // ensure vault to messenger approval
  const usdcVault = new ethers.Contract(USDC_ADDRESS, usdcAbi, vaultController);
  const vaultAllowRaw = await usdcVault.allowance(
    VAULT_ADDRESS,
    TOKEN_MESSENGER_ADDRESS
  );
  // Double checking
  const vaultAllow = BigInt(vaultAllowRaw.toString());
  console.log(
    `Vault to messenger allowance: ${ethers.formatUnits(vaultAllowRaw, 6)} USDC`
  );
  if (vaultAllow < amount) {
    console.log("Approving messenger…");
    await (await vault.approveTokenMessenger()).wait();
    console.log("messenger approved");
  }

  const tx = await vault.depositForBurnCrossChain(
    USER_ADDRESS,
    amount,
    Number(DEST_DOMAIN),
    999999, // maxFee for testing
    1000 // minFinalityThreshold
  );
  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("burnt + message sent");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
