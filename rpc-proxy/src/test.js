import axios from 'axios';

// Configuration
const PROXY_URL = 'http://localhost:8545';
const TEST_ADDRESS = '0x8077982238E31519F3016fa85035cBD066b7F2db'; // Your test address
const TOKEN_ADDRESS = '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E'; // Your test token address

// Standard gas costs for reference
const STANDARD_GAS_COSTS = {
  ETH_TRANSFER: '0x5208',          // 21000
  ERC20_TRANSFER: '0xFDE8',        // 65000
  ERC20_APPROVE: '0xB3B0',         // 46000
  SWAP: '0x30D40',                 // 200000
  DEFAULT: '0x186A0'               // 100000
};

// Helper function to make RPC calls
async function makeRpcCall(method, params, headers = {}) {
  try {
    const response = await axios.post(PROXY_URL, {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error in ${method}:`, error.response?.data || error.message);
    return null;
  }
}

// Test cases
async function runTests() {
  console.log('🧪 Starting RPC Proxy Tests\n');

  // Test 1: Check ETH Balance Spoofing
  console.log('Test 1: ETH Balance Spoofing');
  console.log('-----------------------------');
  
  const spoofedBalance = await makeRpcCall('eth_getBalance', [TEST_ADDRESS, 'latest']);
  console.log('Spoofed Balance:', spoofedBalance.result);
  
  const realBalance = await makeRpcCall('eth_getBalance', [TEST_ADDRESS, 'latest'], {
    'x-balance-type': 'real'
  });
  console.log('Real Balance:', realBalance.result);
  console.log('\n');

  // Test 2: Check Token Balance
  console.log('Test 2: Token Balance Check');
  console.log('---------------------------');
  
  const balanceOfData = '0x70a08231000000000000000000000000' + TEST_ADDRESS.slice(2);
  const tokenBalance = await makeRpcCall('eth_call', [{
    to: TOKEN_ADDRESS,
    data: balanceOfData
  }, 'latest']);
  console.log('Token Balance:', tokenBalance.result);
  console.log('\n');

  // Test 3: Gas Estimation for Different Transaction Types
  console.log('Test 3: Gas Estimation');
  console.log('----------------------');
  
  // 3.1 ETH Transfer
  console.log('3.1 ETH Transfer Gas Estimation:');
  const ethTransferGas = await makeRpcCall('eth_estimateGas', [{
    from: TEST_ADDRESS,
    to: '0x1234567890123456789012345678901234567890',
    value: '0x2386f26fc10000' // 0.01 ETH
  }]);
  console.log('ETH Transfer Gas:', ethTransferGas?.result || STANDARD_GAS_COSTS.ETH_TRANSFER);
  
  // 3.2 ERC20 Transfer
  console.log('\n3.2 ERC20 Transfer Gas Estimation:');
  const erc20TransferGas = await makeRpcCall('eth_estimateGas', [{
    from: TEST_ADDRESS,
    to: TOKEN_ADDRESS,
    data: '0xa9059cbb000000000000000000000000' + // transfer(address,uint256)
          '1234567890123456789012345678901234567890' + // to address
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000'  // 1 token
  }]);
  console.log('ERC20 Transfer Gas:', erc20TransferGas?.result || STANDARD_GAS_COSTS.ERC20_TRANSFER);
  
  // 3.3 ERC20 Approve
  console.log('\n3.3 ERC20 Approve Gas Estimation:');
  const erc20ApproveGas = await makeRpcCall('eth_estimateGas', [{
    from: TEST_ADDRESS,
    to: TOKEN_ADDRESS,
    data: '0x095ea7b3000000000000000000000000' + // approve(address,uint256)
          '1234567890123456789012345678901234567890' + // spender address
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'  // unlimited
  }]);
  console.log('ERC20 Approve Gas:', erc20ApproveGas?.result || STANDARD_GAS_COSTS.ERC20_APPROVE);
  console.log('\n');

  // Test 4: Transaction Simulation
  console.log('Test 4: Transaction Simulation');
  console.log('-----------------------------');
  
  // Get gas price first
  const gasPriceResponse = await makeRpcCall('eth_gasPrice', []);
  const gasPrice = gasPriceResponse?.result || '0x0';
  console.log('Current Gas Price:', gasPrice);
  
  // Simulate ERC20 transfer with gas price
  const txSimulation = await makeRpcCall('eth_call', [{
    from: TEST_ADDRESS,
    to: TOKEN_ADDRESS,
    data: '0xa9059cbb000000000000000000000000' + // transfer(address,uint256)
          '1234567890123456789012345678901234567890' + // to address
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000',  // 1 token
    gasPrice: gasPrice
  }, 'latest']);
  console.log('Transaction Simulation Result:', txSimulation.result);
  console.log('\n');

  // Test 5: Multiple Balance Checks
  console.log('Test 5: Multiple Balance Checks');
  console.log('------------------------------');
  
  console.log('Performing multiple balance checks to verify consistency...');
  for (let i = 0; i < 3; i++) {
    const balance = await makeRpcCall('eth_getBalance', [TEST_ADDRESS, 'latest']);
    console.log(`Check ${i + 1}:`, balance.result);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Run the tests
console.log('🚀 RPC Proxy Test Suite');
console.log('====================\n');
console.log('Proxy URL:', PROXY_URL);
console.log('Test Address:', TEST_ADDRESS);
console.log('Token Address:', TOKEN_ADDRESS);
console.log('\n');

runTests().catch(console.error); 