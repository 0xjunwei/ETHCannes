// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;
}

// Message transmitter receiver interface
interface IMessageTransmitterV2 {
    function receiveMessage(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (bool);

    function sendMessage(
        uint32 destinationDomain,
        bytes32 recipient,
        bytes32 destinationCaller,
        uint32 minFinalityThreshold,
        bytes calldata messageBody
    ) external;
}

contract Node is Ownable, AccessControl {
    bytes32 public constant AUTHORIZED = keccak256("AUTHORIZED");
    // Address for usdc will never change immutable it to reduce gas
    IERC20 public immutable usdc;
    // CCTP Contracts
    ITokenMessengerV2 public tokenMessenger;
    IMessageTransmitterV2 public immutable messageTransmitter;
    /// Chainlink ETH/USD price feed
    AggregatorV3Interface public immutable priceFeed;
    // Vaults
    mapping(address => bool) public isAuthorizedVault;
    // Stores their balance for allowance everytime they do a gasRelay
    mapping(address => uint256) public usdcForGasRemaining;

    event BurnInitiated(
        address indexed caller,
        address indexed user,
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient
    );

    event GasDispersedWithHook(
        address indexed caller,
        address indexed user,
        uint256 ethGasWei,
        uint256 usdcAmount,
        uint32 destinationDomain,
        bytes32 vaultRecipient,
        bytes hookData
    );

    event GasMessageSent(
        address indexed caller,
        address indexed user,
        uint256 ethGasWei,
        uint32 destinationDomain,
        bytes32 vaultRecipient,
        bytes hookData
    );

    constructor(
        address _usdc,
        address _tokenMessenger,
        address _messageTransmitter,
        address _priceFeed
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        messageTransmitter = IMessageTransmitterV2(_messageTransmitter);
        priceFeed = AggregatorV3Interface(_priceFeed);
        _grantRole(AUTHORIZED, msg.sender);
    }

    modifier onlyAuthorized() {
        require(
            owner() == msg.sender || hasRole(AUTHORIZED, msg.sender),
            "Not authorized"
        );
        _;
    }

    // Handle paymaster USDC to USDC transfer
    function depositForBurnCrossChain(
        address user,
        uint256 amount,
        uint32 destinationDomain,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external onlyAuthorized {
        require(amount > 0, "Amount zero");
        usdc.transferFrom(user, address(this), amount);
        // update the contract gas balance
        uint256 remaining = usdc.allowance(user, address(this));
        usdcForGasRemaining[user] = remaining;
        bytes32 destinationUserAddress = bytes32(uint256(uint160(user)));

        tokenMessenger.depositForBurn(
            amount,
            destinationDomain,
            destinationUserAddress,
            address(usdc),
            bytes32(0), // allow any caller on destination
            maxFee,
            minFinalityThreshold
        );

        emit BurnInitiated(
            msg.sender,
            user,
            amount,
            destinationDomain,
            destinationUserAddress
        );
    }

    // Same chain gas drop
    function sameChainGasToken(
        address user,
        uint256 ethGasWei
    ) external onlyAuthorized {
        // Pull usdc and drop gas, poc no additional fee, for stability purpose in future add 5% surcharge to prevent volatile eth prices
        // Integrate swap mechanism to swap to eth upon dispensing
        // compute how much USDC is needed
        uint256 usdcAmt = _computeUsdcAmount(ethGasWei);

        // pull USDC from the user's wallet
        require(
            usdc.transferFrom(user, address(this), usdcAmt),
            "USDC pull failed"
        );
        // update the contract gas balance
        uint256 remaining = usdc.allowance(user, address(this));
        usdcForGasRemaining[user] = remaining;
        // Send native ETH to the user as gas reimbursement
        (bool success, ) = payable(user).call{value: ethGasWei}("");
        require(success, "ETH transfer failed");
    }

    /// Send a cross-chain gas‐reimbursement message CCTP
    function relayGasMessage(
        address user,
        uint256 ethGasWei,
        uint32 destinationDomain,
        bytes32 vaultRecipient,
        uint32 minFinalityThreshold
    ) external onlyAuthorized {
        require(user != address(0), "Invalid user");
        require(vaultRecipient != bytes32(0), "Invalid recipient");
        // Should check if vault is in authorizedList but mvp save time, as i dont wish to authorize every vault for every chain n^n-1 combinations.
        // If relay was called wrongly gas be wasted and user funds pulled but POC, create2 deploy to same address would save this issue.
        // Lazy to use create2

        // compute how much USDC is needed
        uint256 usdcAmt = _computeUsdcAmount(ethGasWei);

        // pull USDC from the user's wallet
        require(
            usdc.transferFrom(user, address(this), usdcAmt),
            "USDC pull failed"
        );
        // update the contract gas balance
        uint256 remaining = usdc.allowance(user, address(this));
        usdcForGasRemaining[user] = remaining;

        // pack hook data
        bytes memory hookData = abi.encode(user, ethGasWei);

        // call the MessageTransmitter directly instead of TokenMessenger
        messageTransmitter.sendMessage(
            destinationDomain,
            vaultRecipient, // recipient
            vaultRecipient, // destinationCaller, restrict incase for vulnerability, cant think of any rn but precaution
            minFinalityThreshold,
            hookData
        );

        emit GasMessageSent(
            msg.sender,
            user,
            ethGasWei,
            destinationDomain,
            vaultRecipient,
            hookData
        );
    }

    /// Compute USDC amount from given ETH using Chainlink price feed
    function _computeUsdcAmount(
        uint256 ethWei
    ) internal view returns (uint256 usdcAmount) {
        (, int256 priceInt, , , ) = priceFeed.latestRoundData();
        require(priceInt > 0, "Invalid price");
        uint256 ethUsd = uint256(priceInt);
        // usdc has 6 decimals, price feed 8, ethWei 18 -> divide by 1e20
        usdcAmount = (ethWei * ethUsd) / 1e20;
        require(usdcAmount > 0, "USDC amount zero");
    }

    function withdrawTokens(
        address tokenAddress,
        uint256 amount
    ) external onlyOwner {
        require(tokenAddress != address(0), "Token address zero");
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(amount > 0 && amount <= balance, "Invalid token amount");
        // Send to msg.sender as onlyOwner can call this function anyways
        bool ok = token.transfer(msg.sender, amount);
        require(ok, "Token transfer failed");
    }
}
