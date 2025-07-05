const networkConfig = {
  421614: {
    name: "arbitrumSepolia",
    domainId: 3,
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    priceFeed: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
    link: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E",
  },
  84532: {
    name: "baseSepolia",
    domainId: 6,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    priceFeed: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
    link: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
  },
  11155420: {
    name: "opSepolia",
    domainId: 2,
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    priceFeed: "0x61Ec26aA57019C486B10502285c5A3D4A4750AD7",
    link: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
  },
};

const developmentChains = ["hardhat", "localhost"];

module.exports = {
  networkConfig,
  developmentChains,
};
