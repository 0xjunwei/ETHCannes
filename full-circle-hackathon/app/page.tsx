"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Zap,
  ArrowRight,
  Shield,
  Globe,
  Wallet,
  RefreshCw,
  CheckCircle,
  Copy,
  ExternalLink,
  Coins,
  Network,
  Lock,
} from "lucide-react"
import { ethers } from "ethers"

const networkConfig = {
  421614: {
    name: "arbitrumSepolia",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    chainName: "Arbitrum Sepolia",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    blockExplorer: "https://sepolia.arbiscan.io",
  },
  84532: {
    name: "baseSepolia",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    chainName: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    blockExplorer: "https://sepolia-explorer.base.org",
  },
  11155420: {
    name: "optimismSepolia",
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    chainName: "Optimism Sepolia",
    rpcUrl: "https://sepolia.optimism.io",
    blockExplorer: "https://sepolia-optimism.etherscan.io",
  },
}

const CHAIN_IDS = {
  ARB: 421614,
  BASE: 84532,
  OP: 11155420,
}

const USDC_ADDRESSES = {
  ARB: networkConfig[421614].usdc,
  BASE: networkConfig[84532].usdc,
  OP: networkConfig[11155420].usdc,
}

const VAULT_ADDRESSES = {
  ARB: "0x307cf6B676284afF0ec40787823ce585fA116B29",
  BASE: "0x96f1D2642455011aC5bEBF2cB875fc85F0Cb3691",
  OP: "0xFd63ED60B1606A35e3D390066BAD3E498301Fc79",
}

const RPC_URL = "http://localhost:8545"

export default function Component() {
  const [connectedWallet, setConnectedWallet] = useState(false)
  const [approvalStatus, setApprovalStatus] = useState({
    ARB: false,
    BASE: false,
    OP: false,
  })
  const [rpcCopied, setRpcCopied] = useState(false)
  const [transactionHashes, setTransactionHashes] = useState<{ [key: string]: string }>({})

  const connectWallet = async () => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" })
        setConnectedWallet(true)
      } catch (error) {
        console.error("Failed to connect wallet:", error)
      }
    } else {
      console.error("Please install MetaMask or another Web3 wallet")
    }
  }

  const switchNetwork = async (chainId: number) => {
    if (typeof window === "undefined" || !window.ethereum) {
      return false
    }

    try {
      const provider = (window as any).ethereum

      // Try to switch to the network
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      })
      return true
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          const config = networkConfig[chainId as keyof typeof networkConfig]
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${chainId.toString(16)}`,
                chainName: config.chainName,
                rpcUrls: [config.rpcUrl],
                blockExplorerUrls: [config.blockExplorer],
                nativeCurrency: {
                  name: "ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
              },
            ],
          })
          return true
        } catch (addError) {
          console.error("Failed to add network:", addError)
          return false
        }
      }
      console.error("Failed to switch network:", switchError)
      return false
    }
  }

  const approveVault = async (chain: string, vaultAddress: string) => {
    if (!connectedWallet) {
      return
    }

    if (typeof window === "undefined" || !window.ethereum) {
      return
    }

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum)

      const chainId = CHAIN_IDS[chain as keyof typeof CHAIN_IDS]

      // Get current chain ID
      const currentChainId = await provider.getNetwork().then((network) => network.chainId)

      // Switch network if not on correct chain
      if (currentChainId !== chainId) {
        const switched = await switchNetwork(chainId)
        if (!switched) {
          console.error(`Failed to switch to ${chain} network`)
          return
        }
      }

      // Ensure accounts are unlocked
      const signer = await provider.getSigner()

      const from = await signer.getAddress()

      const usdcAddress = USDC_ADDRESSES[chain as keyof typeof USDC_ADDRESSES]

      // Standard ERC-20 approve(address spender, uint256 amount) for all chains
      const approveData =
        "0x095ea7b3" + // approve function selector
        vaultAddress.slice(2).padStart(64, "0") + // spender (vault)
        "f".repeat(64) // uint256 max amount

      const txParams = {
        to: usdcAddress,
        data: approveData,
        gasLimit: 100_000n,
      } as const

      const tx = await signer.sendTransaction(txParams)
      const txHash = tx.hash

      console.log(`Approval transaction sent: ${txHash}`)

      // Update status and store transaction hash
      setApprovalStatus((prev) => ({
        ...prev,
        [chain]: true,
      }))

      setTransactionHashes((prev) => ({
        ...prev,
        [chain]: txHash,
      }))
    } catch (error) {
      console.error("Approval failed:", error)
    }
  }

  const copyRPC = () => {
    navigator.clipboard.writeText(RPC_URL)
    setRpcCopied(true)
    setTimeout(() => setRpcCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <Badge className="mb-4" variant="secondary">
            <Zap className="w-4 h-4 mr-2" />
            Web3 Hackathon Project
          </Badge>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Gas-Free Transactions with Stablecoins
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Revolutionary RPC solution that eliminates gas tokens. Transact on any chain using USDC with any wallet - no
            bridging, no specialized wallets, no dApp integration required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={connectWallet} className="bg-gradient-to-r from-blue-600 to-purple-600">
              {connectedWallet ? (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Wallet Connected
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5 mr-2" />
                  Connect Wallet
                </>
              )}
            </Button>
            <Button size="lg" variant="outline">
              <ExternalLink className="w-5 h-5 mr-2" />
              View Documentation
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">How It Works</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Our solution combines Circle CCTP v2 and ChainLink Data Feeds to enable seamless gas abstraction
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <Card className="text-center">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Network className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-lg">1. Configure RPC</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Replace your MetaMask RPC with our custom endpoint</p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Coins className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-lg">2. Approve USDC</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Approve our vaults to spend USDC for gas conversion</p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-lg">3. Auto Swap</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">We automatically swap USDC for gas using ChainLink feeds</p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle className="text-lg">4. Execute</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Transaction executes seamlessly with converted gas</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Setup Instructions */}
      <section className="container mx-auto px-4 py-16">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <Globe className="w-6 h-6 mr-2" />
              Setup Instructions
            </CardTitle>
            <CardDescription>Follow these steps to start using gas-free transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="rpc" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="rpc">Configure RPC</TabsTrigger>
                <TabsTrigger value="approve">Approve Vaults</TabsTrigger>
              </TabsList>

              <TabsContent value="rpc" className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step 1: Add Custom RPC to MetaMask</h3>
                  <Alert className="mb-4">
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      This RPC endpoint intercepts transactions to perform gas abstraction. Your funds remain secure as
                      the code is open-source and auditable.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="rpc-url">RPC URL</Label>
                      <div className="flex gap-2 mt-1">
                        <Input id="rpc-url" value={RPC_URL} readOnly className="font-mono" />
                        <Button variant="outline" size="icon" onClick={copyRPC}>
                          {rpcCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">MetaMask Configuration:</h4>
                      <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                        <li>Open MetaMask and go to Settings → Networks</li>
                        <li>Click "Add Network" or edit existing network</li>
                        <li>
                          Replace the RPC URL with: <code className="bg-white px-1 rounded">{RPC_URL}</code>
                        </li>
                        <li>Save the configuration</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="approve" className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step 2: Approve USDC Spending</h3>
                  <p className="text-gray-600 mb-6">
                    Approve our testnet vaults to spend USDC for automatic gas conversion on each chain. The system will
                    automatically switch to the correct testnet if needed.
                  </p>

                  <div className="grid gap-4">
                    {Object.entries(VAULT_ADDRESSES).map(([chain, vaultAddress]) => (
                      <Card key={chain}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">{chain} Chain Vault</h4>
                              <p className="text-sm text-gray-500 font-mono">{vaultAddress}</p>
                            </div>
                            <Button
                              onClick={() => approveVault(chain, vaultAddress)}
                              disabled={!connectedWallet || approvalStatus[chain as keyof typeof approvalStatus]}
                              variant={approvalStatus[chain as keyof typeof approvalStatus] ? "secondary" : "default"}
                            >
                              {approvalStatus[chain as keyof typeof approvalStatus] ? (
                                <>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Approved
                                </>
                              ) : (
                                <>
                                  <Lock className="w-4 h-4 mr-2" />
                                  Approve USDC
                                </>
                              )}
                            </Button>
                          </div>
                          {transactionHashes[chain] && (
                            <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                              <p className="text-sm text-green-700 font-medium">Transaction Hash:</p>
                              <p className="text-xs text-green-600 font-mono break-all">{transactionHashes[chain]}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      Approvals are set to MAX_UINT256 for seamless transactions. You can revoke these approvals at any
                      time through your wallet.
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      {/* Technical Details */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Technical Architecture</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Circle CCTP v2 Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Fast cross-chain USDC transfers</li>
                  <li>• Native burn-and-mint mechanism</li>
                  <li>• Reduced settlement times</li>
                  <li>• Lower transaction costs</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="w-5 h-5 mr-2" />
                  ChainLink Data Feeds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Real-time price data</li>
                  <li>• Accurate USDC/ETH conversion</li>
                  <li>• Decentralized price oracles</li>
                  <li>• Tamper-resistant feeds</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Transaction Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-blue-600">1</span>
                  </div>
                  <p className="text-sm">User initiates transaction</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 hidden md:block" />
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-green-600">2</span>
                  </div>
                  <p className="text-sm">RPC intercepts & pauses</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 hidden md:block" />
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-purple-600">3</span>
                  </div>
                  <p className="text-sm">USDC → Gas conversion</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 hidden md:block" />
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-orange-600">4</span>
                  </div>
                  <p className="text-sm">Transaction executes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-4 py-16 bg-gray-50">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Key Benefits</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">Why our solution is revolutionary for Web3 user experience</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <Wallet className="w-8 h-8 text-blue-600 mb-2" />
              <CardTitle>Universal Wallet Support</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Works with any wallet including MetaMask, WalletConnect, and more. No need for specialized wallets or
                extensions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Globe className="w-8 h-8 text-green-600 mb-2" />
              <CardTitle>Network Level Solution</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Operates at the RPC level, meaning no dApp integration required. Works with any existing dApp
                automatically.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="w-8 h-8 text-purple-600 mb-2" />
              <CardTitle>Trustless & Auditable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Open-source code ensures transparency. Smart contracts prevent unauthorized fund access while
                maintaining security.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-gray-600">
        <p>Built for Web3 Hackathon • Open Source • Auditable • Trustless</p>
      </footer>
    </div>
  )
}
