import { createWalletClient, createPublicClient, custom, http } from 'viem'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
 
export const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http()
})
 
export const walletClient = createWalletClient({
  chain: arbitrumSepolia,
  transport: custom(window.ethereum)
})
 
// JSON-RPC Account
export const [account] = await walletClient.getAddresses()