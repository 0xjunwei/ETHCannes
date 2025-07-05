import React, { useState } from 'react';
import { motion } from 'framer-motion';

const chains = [
  { 
    id: 'ethereum', 
    name: 'Ethereum', 
    balance: 257.82, 
    icon: '🔷',
    color: 'from-blue-500 to-blue-600' 
  },
  { 
    id: 'polygon', 
    name: 'Polygon', 
    balance: 542.15, 
    icon: '🟣',
    color: 'from-purple-500 to-purple-600' 
  },
  { 
    id: 'arbitrum', 
    name: 'Arbitrum', 
    balance: 125.43, 
    icon: '🔵',
    color: 'from-indigo-500 to-indigo-600' 
  },
  { 
    id: 'optimism', 
    name: 'Optimism', 
    balance: 89.75, 
    icon: '🔴',
    color: 'from-red-500 to-red-600' 
  },
  { 
    id: 'base', 
    name: 'Base', 
    balance: 178.32, 
    icon: '🔷',
    color: 'from-blue-400 to-blue-500' 
  }
];

const ChainBalances = () => {
  const [selectedChains, setSelectedChains] = useState<string[]>(chains.map(c => c.id));
  const totalBalance = chains
    .filter(chain => selectedChains.includes(chain.id))
    .reduce((sum, chain) => sum + chain.balance, 0);

  const toggleChain = (chainId: string) => {
    if (selectedChains.includes(chainId)) {
      setSelectedChains(selectedChains.filter(id => id !== chainId));
    } else {
      setSelectedChains([...selectedChains, chainId]);
    }
  };

  return (
    <section className="py-16 px-6">
      <div className="max-w-screen-xl mx-auto">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold text-white mb-4">Your USDC Balance Across Chains</h2>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Gasout aggregates your USDC balance from multiple chains for seamless gas payments
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div 
            className="lg:col-span-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h3 className="text-white font-semibold mb-4">Select Chains to Aggregate</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {chains.map((chain, index) => (
                <motion.div 
                  key={chain.id}
                  className={`border rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                    selectedChains.includes(chain.id) 
                      ? `border-slate-500 bg-slate-700/50` 
                      : `border-slate-700 bg-slate-800/30`
                  }`}
                  onClick={() => toggleChain(chain.id)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center">
                        <span className="text-lg">{chain.icon}</span>
                      </div>
                      <span className="text-white font-medium">{chain.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">${chain.balance.toFixed(2)}</div>
                      <div className="text-xs text-slate-400">USDC</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 flex flex-col"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <h3 className="text-white font-semibold mb-4">Aggregated Balance</h3>
            
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6">
                <div className="w-28 h-28 rounded-full bg-slate-900 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-white">${totalBalance.toFixed(2)}</span>
                  <span className="text-sm text-slate-300">USDC</span>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-slate-300 mb-6">Total USDC available for gas payments</p>
                <motion.button
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-full font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Use Aggregated Balance
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ChainBalances;
