import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, LogOut } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';

const Header = () => {
  const { isConnected, address, connect, disconnect } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <motion.header 
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-slate-900/80 backdrop-blur-sm border-b border-slate-800"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div 
        className="flex items-center"
        whileHover={{ scale: 1.05 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px]">
            <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
              <span className="text-white font-bold text-xl">FC</span>
            </div>
          </div>
          <span className="text-white font-bold text-xl">FullCircle</span>
        </div>
      </motion.div>
      
      {isConnected ? (
        <div className="flex items-center gap-3">
          <div className="text-white text-sm">
            {formatAddress(address || '')}
          </div>
          <motion.button
            onClick={disconnect}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-full border border-slate-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <LogOut size={16} />
            <span>Disconnect</span>
          </motion.button>
        </div>
      ) : (
        <motion.button
          onClick={connect}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-full border border-slate-700"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          <Wallet size={16} />
          <span>Connect Wallet</span>
        </motion.button>
      )}
    </motion.header>
  );
};

export default Header;
