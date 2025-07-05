import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Info, Lock, LockOpen } from 'lucide-react';

const ApprovalSection = () => {
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [approvals, setApprovals] = useState({
    allowance: false,
    spendUSDC: false,
    vaultApproval: false
  });

  const toggleAccordion = (id: string) => {
    setActiveAccordion(activeAccordion === id ? null : id);
  };

  const handleApproval = (key: keyof typeof approvals) => {
    setApprovals({
      ...approvals,
      [key]: !approvals[key]
    });
  };

  return (
    <section className="py-16 px-6 bg-slate-900/50">
      <div className="max-w-screen-xl mx-auto">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold text-white mb-4">USDC Approvals</h2>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Manage your USDC approvals and allowances for gas payments
          </p>
        </motion.div>

        <motion.div 
          className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="divide-y divide-slate-700">
            {/* Allowance Approval */}
            <div className="p-6">
              <div 
                className="flex justify-between items-center cursor-pointer"
                onClick={() => toggleAccordion('allowance')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${approvals.allowance ? 'bg-green-500/20' : 'bg-slate-700'} flex items-center justify-center`}>
                    {approvals.allowance ? <Check className="text-green-500" size={20} /> : <Lock className="text-slate-400" size={20} />}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Allowance to Spend USDC from Vault</h3>
                    <p className="text-slate-400 text-sm">Allow Gasout to use USDC from your source chain</p>
                  </div>
                </div>
                <ChevronDown 
                  className={`text-slate-400 transition-transform duration-300 ${activeAccordion === 'allowance' ? 'rotate-180' : ''}`} 
                  size={20} 
                />
              </div>
              
              {activeAccordion === 'allowance' && (
                <motion.div 
                  className="mt-6 pt-6 border-t border-slate-700"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4 flex items-start gap-3">
                      <Info className="text-blue-400 shrink-0 mt-1" size={16} />
                      <p className="text-slate-300 text-sm">
                        This approval allows Gasout to access your USDC balance from your selected source chain vault.
                        Required for aggregating balances across multiple chains.
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white">Status: </span>
                        <span className={approvals.allowance ? "text-green-500" : "text-red-400"}>
                          {approvals.allowance ? "Approved" : "Not Approved"}
                        </span>
                      </div>
                      
                      <motion.button
                        className={`px-4 py-2 rounded-full font-medium flex items-center gap-2 ${
                          approvals.allowance 
                            ? "bg-slate-700 text-slate-300" 
                            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleApproval('allowance')}
                      >
                        {approvals.allowance ? (
                          <>
                            <LockOpen size={16} />
                            <span>Revoke Allowance</span>
                          </>
                        ) : (
                          <>
                            <Lock size={16} />
                            <span>Approve Allowance</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            
            {/* Spend USDC Approval */}
            <div className="p-6">
              <div 
                className="flex justify-between items-center cursor-pointer"
                onClick={() => toggleAccordion('spend')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${approvals.spendUSDC ? 'bg-green-500/20' : 'bg-slate-700'} flex items-center justify-center`}>
                    {approvals.spendUSDC ? <Check className="text-green-500" size={20} /> : <Lock className="text-slate-400" size={20} />}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Approval to Spend USDC</h3>
                    <p className="text-slate-400 text-sm">Allow Gasout to spend your USDC for gas payments</p>
                  </div>
                </div>
                <ChevronDown 
                  className={`text-slate-400 transition-transform duration-300 ${activeAccordion === 'spend' ? 'rotate-180' : ''}`} 
                  size={20} 
                />
              </div>
              
              {activeAccordion === 'spend' && (
                <motion.div 
                  className="mt-6 pt-6 border-t border-slate-700"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4 flex items-start gap-3">
                      <Info className="text-blue-400 shrink-0 mt-1" size={16} />
                      <p className="text-slate-300 text-sm">
                        This approval grants Gasout permission to use your USDC tokens for gas payments.
                        You maintain control over how much USDC can be spent.
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white">Status: </span>
                        <span className={approvals.spendUSDC ? "text-green-500" : "text-red-400"}>
                          {approvals.spendUSDC ? "Approved" : "Not Approved"}
                        </span>
                      </div>
                      
                      <motion.button
                        className={`px-4 py-2 rounded-full font-medium flex items-center gap-2 ${
                          approvals.spendUSDC 
                            ? "bg-slate-700 text-slate-300" 
                            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleApproval('spendUSDC')}
                      >
                        {approvals.spendUSDC ? (
                          <>
                            <LockOpen size={16} />
                            <span>Revoke Approval</span>
                          </>
                        ) : (
                          <>
                            <Lock size={16} />
                            <span>Approve Spending</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            
            {/* USDC to Vault Approval */}
            <div className="p-6">
              <div 
                className="flex justify-between items-center cursor-pointer"
                onClick={() => toggleAccordion('vault')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${approvals.vaultApproval ? 'bg-green-500/20' : 'bg-slate-700'} flex items-center justify-center`}>
                    {approvals.vaultApproval ? <Check className="text-green-500" size={20} /> : <Lock className="text-slate-400" size={20} />}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Approval for USDC to Vault</h3>
                    <p className="text-slate-400 text-sm">Allow your USDC to be transferred to the Gasout vault</p>
                  </div>
                </div>
                <ChevronDown 
                  className={`text-slate-400 transition-transform duration-300 ${activeAccordion === 'vault' ? 'rotate-180' : ''}`} 
                  size={20} 
                />
              </div>
              
              {activeAccordion === 'vault' && (
                <motion.div 
                  className="mt-6 pt-6 border-t border-slate-700"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4 flex items-start gap-3">
                      <Info className="text-blue-400 shrink-0 mt-1" size={16} />
                      <p className="text-slate-300 text-sm">
                        This approval permits the transfer of your USDC to the Gasout vault for seamless cross-chain gas payments.
                        The vault is secured by industry-standard audits and security practices.
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white">Status: </span>
                        <span className={approvals.vaultApproval ? "text-green-500" : "text-red-400"}>
                          {approvals.vaultApproval ? "Approved" : "Not Approved"}
                        </span>
                      </div>
                      
                      <motion.button
                        className={`px-4 py-2 rounded-full font-medium flex items-center gap-2 ${
                          approvals.vaultApproval 
                            ? "bg-slate-700 text-slate-300" 
                            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleApproval('vaultApproval')}
                      >
                        {approvals.vaultApproval ? (
                          <>
                            <LockOpen size={16} />
                            <span>Revoke Approval</span>
                          </>
                        ) : (
                          <>
                            <Lock size={16} />
                            <span>Approve Vault</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
        
        <motion.div 
          className="mt-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <motion.button
            className="px-6 py-3 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium shadow-lg shadow-indigo-900/20"
            whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(99, 102, 241, 0.5)" }}
            whileTap={{ scale: 0.98 }}
          >
            Add Magic RPC
          </motion.button>
          <p className="mt-4 text-slate-400 text-sm">
            Add Magic RPC to your wallet to enable seamless gas payments with USDC
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default ApprovalSection;
