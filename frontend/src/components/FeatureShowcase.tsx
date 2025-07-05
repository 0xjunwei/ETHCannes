import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Coins, Globe, Zap, Layout } from 'lucide-react';

const features = [
  {
    icon: <Globe className="text-blue-400" size={24} />,
    title: "Cross-Chain Compatibility",
    description: "Pay for gas using USDC from any supported blockchain (Arb, Op, Base)"
  },
  {
    icon: <Coins className="text-green-400" size={24} />,
    title: "USDC Balance Aggregation",
    description: "View and use your combined USDC balance across multiple chains"
  },
  {
    icon: <Layout className="text-purple-400" size={24} />,
    title: "Leverage Popular Dapps",
    description: "No constrains of types of Dapps usable when paying gas in USDC"
  },
  {
    icon: <Zap className="text-yellow-400" size={24} />,
    title: "No Gas Token, No Problem!",
    description: "No needs to keep swapping for Gas Token when one runs one, and on different chains too... what a headache smh"
  }
];

const FeatureItem = ({ feature, index }: { feature: typeof features[0], index: number }) => {
  return (
    <motion.div 
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 flex flex-col gap-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
      whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(139, 92, 246, 0.15)" }}
    >
      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
        {React.cloneElement(feature.icon, { size: 20 })}
      </div>
      <h3 className="text-white text-base font-semibold">{feature.title}</h3>
      <p className="text-slate-300 text-sm">{feature.description}</p>
    </motion.div>
  );
};

const FeatureShowcase = () => {
  const scrollToHowItWorks = () => {
    const element = document.getElementById('how-it-works');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="pt-24 pb-12 px-6">
      <motion.div 
        className="max-w-screen-xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
      >
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Gas Payment Interface using <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">USDC</span>
          </h2>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">
            FullCircle enables users to leverage USDC Gas payments on pre-existing Dapps using their USDC balances from multiple chains
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {features.map((feature, index) => (
            <FeatureItem key={index} feature={feature} index={index} />
          ))}
        </div>

        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <motion.button
            onClick={scrollToHowItWorks}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-full font-medium"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <span>Get Started</span>
            <ArrowRight size={16} />
          </motion.button>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default FeatureShowcase;
