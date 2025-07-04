require("dotenv").config();
const { network } = require("hardhat");
const { verify } = require("../utils/verify");
const {
  networkConfig,
  developmentChains,
} = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  const config = networkConfig[chainId];

  log("----------------------------------------------------");
  log(`Deploying Node to ${config.name}...`);

  const args = [config.usdc, config.tokenMessenger, config.priceFeed];

  const vault = await deploy("Node", {
    from: deployer,
    args,
    log: true,
    waitConfirmations: 3,
  });

  log(`Vault deployed at: ${vault.address}`);

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying Vault contract on Etherscan...");
    await verify(vault.address, args);
  }
};

module.exports.tags = ["vault"];
