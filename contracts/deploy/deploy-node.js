require("dotenv").config();
const { verify } = require("../utils/verify");
const {
  networkConfig,
  developmentChains,
} = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments, network, ethers }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  const config = networkConfig[chainId];

  log("----------------------------------------------------");
  log(`Deploying Vault to ${network.name} (chainId=${chainId})...`);

  // Deploy Vault
  const args = [
    config.usdc,
    config.tokenMessenger,
    config.messageTransmitter,
    config.priceFeed,
  ];
  const vaultDeployment = await deploy("Node", {
    from: deployer,
    args,
    log: true,
    waitConfirmations: config.blockConfirmations || 3,
  });
  const vaultAddress = vaultDeployment.address;
  log(`Vault deployed at: ${vaultAddress}`);

  // Verify on Etherscan
  /*if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying Vault on Etherscan...");
    try {
      await verify(vaultAddress, args);
      log("Vault verified");
    } catch (err) {
      log("Verification failed:", err.message);
    }
  }*/

  // Initialize USDC approval
  log("Calling approveTokenMessenger()...");
  const deployerSigner = await ethers.getSigner(deployer);
  const vaultContract = await ethers.getContractAt(
    "Node",
    vaultAddress,
    deployerSigner
  );
  const txApprove = await vaultContract.approveTokenMessenger();
  await txApprove.wait(1);
  log("approveTokenMessenger() completed");

  // Transfer 5 LINK into the Vault
  if (config.link) {
    log(`Transferring 5 LINK (${config.link}) → Vault...`);
    const linkToken = await ethers.getContractAt(
      "IERC20",
      config.link,
      deployerSigner
    );
    const linkAmount = ethers.parseUnits("5", 18);
    const txLink = await linkToken.transfer(vaultAddress, linkAmount);
    await txLink.wait(1);
    log("5 LINK transferred to Vault");
  } else {
    log("No LINK token address configured; skipping LINK transfer.");
  }

  // Fund the Vault with 0.1 ETH
  log("Sending 0.1 ETH → Vault...");
  const ethTx = await deployerSigner.sendTransaction({
    to: vaultAddress,
    value: ethers.parseEther("0.1"),
  });
  await ethTx.wait(1);
  log("0.1 ETH sent to Vault");

  log("----------------------------------------------------\n");
};

module.exports.tags = ["node"];
