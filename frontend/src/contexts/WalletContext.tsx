import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createPublicClient, createWalletClient, custom, http, PublicClient, WalletClient } from 'viem';
import { mainnet, arbitrum, optimism, base, polygon } from 'viem/chains';

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
  addNetwork: (networkConfig: any) => Promise<void>;
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  const connect = async () => {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        // Request account access
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });

        if (accounts.length > 0) {
          const account = accounts[0];
          setAddress(account);
          setIsConnected(true);

          // Get chain ID
          const chainId = await window.ethereum.request({
            method: 'eth_chainId',
          });
          setChainId(parseInt(chainId, 16));

          // Create clients
          const publicClient = createPublicClient({
            chain: mainnet,
            transport: http(),
          });

          const walletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum),
          });

          setPublicClient(publicClient);
          setWalletClient(walletClient);
        }
      } else {
        alert('Please install MetaMask to connect your wallet');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setAddress(null);
    setChainId(null);
    setPublicClient(null);
    setWalletClient(null);
  };

  const switchChain = async (targetChainId: number) => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
      setChainId(targetChainId);
    } catch (error: any) {
      console.error('Error switching chain:', error);
      throw error;
    }
  };

  const addNetwork = async (networkConfig: any) => {
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [networkConfig],
      });
    } catch (error: any) {
      console.error('Error adding network:', error);
      throw error;
    }
  };

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setAddress(accounts[0]);
        }
      };

      const handleChainChanged = (chainId: string) => {
        setChainId(parseInt(chainId, 16));
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const value: WalletContextType = {
    isConnected,
    address,
    chainId,
    connect,
    disconnect,
    switchChain,
    addNetwork,
    publicClient,
    walletClient,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ethereum?: any;
  }
} 