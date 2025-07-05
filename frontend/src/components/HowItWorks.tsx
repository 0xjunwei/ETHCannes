import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Network, Key, Wallet, Zap, ArrowRight, Coins, Plus } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { publicClient, walletClient, account } from '../config/config';
import { erc20Abi } from 'viem';
import axios from 'axios';

const setupSteps = [
  {
    id: 1,
    title: "Add Magic RPC",
    description: "Enter the following Magic RPC to your Metamask Network - testnet networks must be enabled",
    icon: <Network className="text-blue-400" size={24} />,
  },
  {
    id: 2,
    title: "Approve Requirements",
    description: "Add approvals for vaults/ requirements",
    icon: <Key className="text-green-400" size={24} />,
  },
  {
    id: 3,
    title: "Add USDC",
    description: "Add USDC to smart account",
    icon: <Coins className="text-yellow-400" size={24} />,
  }
];

const features = [
  {
    id: 4,
    title: "Spoof ETH Balance",
    description: "When sending a transaction, spoof ETH Balance to enable all transactions to be sendable even when one does not have ETH in wallet",
    icon: <Wallet className="text-purple-400" size={24} />,
  },
  {
    id: 5,
    title: "Pay Gas with USDC",
    description: "Leverage Circle paymaster to pay for gas using USDC",
    icon: <Zap className="text-pink-400" size={24} />,
  },
  {
    id: 6,
    title: "Bridge USDC",
    description: "Leverage Circle CCTP to bridge USDC from other chains to pay for gas as well",
    icon: <ArrowRight className="text-indigo-400" size={24} />,
  }
];

// Magic RPC Network Configuration (using Arbitrum Sepolia as example)
const magicRpcConfig = {
  chainId: '0x66eee', // 421614 in hex
  chainName: 'Arbitrum Sepolia (Magic RPC)',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['http://localhost:8545'], // This would be your Magic RPC URL
  blockExplorerUrls: ['https://sepolia.arbiscan.io/'],
};

const HowItWorks = () => {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const { isConnected, connect } = useWallet();

  const toggleStep = (stepId: number) => {
    if (completedSteps.includes(stepId)) {
      setCompletedSteps(completedSteps.filter(id => id !== stepId));
    } else {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };
 
  const handleStepAction = async (stepId: number) => {
    if (!isConnected) {
      connect();
      return;
    }

    // Handle approve requirements step
    if (stepId === 2) {
      try {
        // Set loading state
        setCompletedSteps(prev => prev.filter(id => id !== stepId));
        
        // Then simulate and execute the approval
        const { request } = await publicClient.simulateContract({
          account,
          address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC address
          abi: erc20Abi,
          functionName: 'approve',
          args: [
            '0x307cf6B676284afF0ec40787823ce585fA116B29', // spender (contract address)
            BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') // unlimited approval
          ]
        });

        // Execute the transaction
        const txHash = await walletClient.writeContract(request);
        console.log(txHash);
        
        // Wait for transaction confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        
        if (receipt.status === 'success') {
          setCompletedSteps(prev => [...prev, stepId]);
        }
      } catch (error) {
        console.error('Approval failed:', error);
      }
      return;
    }

    // Handle other steps
    toggleStep(stepId);
  };

  const getButtonText = (step: any) => {
    if (!isConnected) return 'Connect Wallet First';
    return completedSteps.includes(step.id) ? 'Completed' : 'Mark as Complete';
  };

  const getButtonClass = (step: any) => {
    if (!isConnected) return 'bg-slate-600 text-slate-300 cursor-not-allowed';
    return completedSteps.includes(step.id)
      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white';
  };

  return (
    <>
      {/* How It Works Section */}
      <section className="py-16 px-6" id="how-it-works">
        <div className="max-w-screen-xl mx-auto">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              Understanding the magic behind FullCircle
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.id}
                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-slate-300 text-sm">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to Use Section */}
      <section className="py-16 px-6" id="how-to-use">
        <div className="max-w-screen-xl mx-auto">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-white mb-4">How to Use</h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              Follow these simple steps to get started with USDC gas payments
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {setupSteps.map((step, index) => (
              <motion.div
                key={step.id}
                className={`bg-slate-800/50 backdrop-blur-sm border ${
                  completedSteps.includes(step.id) 
                    ? 'border-green-500/50 shadow-lg shadow-green-500/10' 
                    : 'border-slate-700'
                } rounded-xl p-6`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg ${
                    completedSteps.includes(step.id) 
                      ? 'bg-green-500/20' 
                      : 'bg-slate-700'
                  } flex items-center justify-center`}>
                    {completedSteps.includes(step.id) ? (
                      <Check className="text-green-500" size={24} />
                    ) : step.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                      <span>Step {step.id}:</span>
                      <span>{step.title}</span>
                    </h3>
                    <p className="text-slate-300 text-sm mb-4">{step.description}</p>
                    
                    {step.id === 1 && (
                      <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
                        <div className="text-xs text-slate-400 mb-2">Network Details:</div>
                        <div className="text-xs text-slate-300">
                          <div>Chain ID: {parseInt(magicRpcConfig.chainId, 16)}</div>
                          <div>Network: {magicRpcConfig.chainName}</div>
                          <div>Currency: {magicRpcConfig.nativeCurrency.symbol}</div>
                          <div>RPC: {magicRpcConfig.rpcUrls[0]}</div>
                        </div>
                      </div>
                    )}
                    
                    <motion.button
                      className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${getButtonClass(step)}`}
                      whileHover={{ scale: !isConnected ? 1 : 1.05 }}
                      whileTap={{ scale: !isConnected ? 1 : 0.98 }}
                      onClick={() => handleStepAction(step.id)}
                    >
                      {!isConnected && <Plus size={16} />}
                      {getButtonText(step)}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default HowItWorks; 