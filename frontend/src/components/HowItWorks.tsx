import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Network, Key, Wallet, Zap, ArrowRight, Coins, Plus } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';

const steps = [
  {
    id: 1,
    title: "Add Magic RPC",
    description: "Magic RPC will be added into your specific Metamask Network - it acts as a Proxy to the actual RPC",
    icon: <Network className="text-blue-400" size={24} />,
    requiresWallet: true,
  },
  {
    id: 2,
    title: "Approve Requirements",
    description: "Add approvals for all vaults/ requirements",
    icon: <Key className="text-green-400" size={24} />,
    requiresWallet: false,
  },
  {
    id: 3,
    title: "Add USDC",
    description: "Add USDC to smart account",
    icon: <Coins className="text-yellow-400" size={24} />,
    requiresWallet: false,
  },
  {
    id: 4,
    title: "Spoof ETH Balance",
    description: "When sending a transaction, spoof ETH Balance to enable all transactions to be sendable even when one does not have ETH in wallet",
    icon: <Wallet className="text-purple-400" size={24} />,
    requiresWallet: false,
  },
  {
    id: 5,
    title: "Pay Gas with USDC",
    description: "Leverage Circle paymaster to pay for gas using USDC",
    icon: <Zap className="text-pink-400" size={24} />,
    requiresWallet: false,
  },
  {
    id: 6,
    title: "Bridge USDC",
    description: "Leverage Circle CCTP to bridge USDC from other chains to pay for gas as well",
    icon: <ArrowRight className="text-indigo-400" size={24} />,
    requiresWallet: false,
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
  rpcUrls: ['https://localhost:8545'], // This would be your Magic RPC URL
  blockExplorerUrls: ['https://sepolia.arbiscan.io/'],
};

const HowItWorks = () => {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isAddingNetwork, setIsAddingNetwork] = useState(false);
  const { isConnected, addNetwork, connect } = useWallet();

  const toggleStep = (stepId: number) => {
    if (completedSteps.includes(stepId)) {
      setCompletedSteps(completedSteps.filter(id => id !== stepId));
    } else {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };

  const handleAddMagicRPC = async () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    setIsAddingNetwork(true);
    try {
      await addNetwork(magicRpcConfig);
      setCompletedSteps([...completedSteps, 1]);
      alert('Magic RPC network added successfully!');
    } catch (error: any) {
      console.error('Error adding network:', error);
      if (error.code === 4902) {
        alert('Network already exists in your wallet');
      } else {
        alert('Failed to add network. Please try again.');
      }
    } finally {
      setIsAddingNetwork(false);
    }
  };

  const handleStepAction = async (stepId: number) => {
    if (stepId === 1) {
      await handleAddMagicRPC();
    } else {
      toggleStep(stepId);
    }
  };

  const getButtonText = (step: any) => {
    if (step.id === 1) {
      if (!isConnected) return 'Connect Wallet First';
      if (isAddingNetwork) return 'Adding Network...';
      if (completedSteps.includes(step.id)) return 'Network Added';
      return 'Add Magic RPC';
    }
    return completedSteps.includes(step.id) ? 'Completed' : 'Mark as Complete';
  };

  const getButtonClass = (step: any) => {
    if (step.id === 1) {
      if (!isConnected) return 'bg-slate-600 text-slate-300 cursor-not-allowed';
      if (isAddingNetwork) return 'bg-yellow-500/20 text-yellow-400';
      if (completedSteps.includes(step.id)) return 'bg-green-500/20 text-green-400';
      return 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white';
    }
    return completedSteps.includes(step.id)
      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white';
  };

  return (
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
            Follow these simple steps to start using USDC for gas payments
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step, index) => (
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
                      </div>
                    </div>
                  )}
                  
                  <motion.button
                    className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${getButtonClass(step)}`}
                    whileHover={{ scale: step.id === 1 && !isConnected ? 1 : 1.05 }}
                    whileTap={{ scale: step.id === 1 && !isConnected ? 1 : 0.98 }}
                    onClick={() => step.id === 1 && !isConnected ? connect() : handleStepAction(step.id)}
                    disabled={step.id === 1 && isAddingNetwork}
                  >
                    {step.id === 1 && !completedSteps.includes(step.id) && <Plus size={16} />}
                    {getButtonText(step)}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks; 