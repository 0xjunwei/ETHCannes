import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import './index.css';
import { WalletProvider } from './contexts/WalletContext';
import Header from './components/Header';
import FeatureShowcase from './components/FeatureShowcase';
import ChainBalances from './components/ChainBalances';
import HowItWorks from './components/HowItWorks';
import Footer from './components/Footer';

export function App() {
  useEffect(() => {
    // Add Inter font
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    return () => {
      // Clean up
      document.head.removeChild(link);
    };
  }, []);

  return (
    <WalletProvider>
      <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Animated background elements */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-purple-600/10 blur-3xl"
            animate={{
              x: [0, 20, 0],
              y: [0, -20, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
          <motion.div
            className="absolute top-1/3 -left-20 w-72 h-72 rounded-full bg-indigo-600/10 blur-3xl"
            animate={{
              x: [0, -30, 0],
              y: [0, 30, 0],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
          <motion.div
            className="absolute bottom-20 right-1/4 w-56 h-56 rounded-full bg-blue-600/10 blur-3xl"
            animate={{
              x: [0, 20, 0],
              y: [0, 20, 0],
            }}
            transition={{
              duration: 9,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
        </div>

        <Header />
        
        <main className="flex-1 z-10">
          <FeatureShowcase />
          <HowItWorks />
          <ChainBalances />
        </main>
        
        <Footer />
      </div>
    </WalletProvider>
  );
}

export default App;
