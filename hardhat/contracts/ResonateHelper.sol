// SPDX-License-Identifier: GNU-GPL

pragma solidity >=0.8.0;

import "./interfaces/IResonate.sol";
import "./interfaces/IResonateHelper.sol";
import "./interfaces/ISmartWallet.sol";
import "./interfaces/IFNFTHandler.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IERC20Detailed.sol";
import "./utils/BytesLib.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./SmartWallet.sol";
import "./PoolSmartWallet.sol";

contract ResonateHelper is IResonateHelper, AccessControl {

    using BytesLib for bytes;

    /// The address of the PoolSmartWallet template contract for queued orders
    address public override POOL_TEMPLATE;

    /// The address of the SmartWallet template contract for active FNFTs
    address public override FNFT_TEMPLATE;

    /// The 'SandwichBot' which may trigger privileged actions
    address public immutable override SANDWICH_BOT_ADDRESS;

    /// The role which may invoke the break-glass functionality and disable Resonate
    bytes32 public constant BREAKER = 'BREAKER';    

    /// The role which may unbreak the glass and reenable Resonate
    bytes32 public constant ADMIN = 'ADMIN';

    /// owner will be set to deployer at creation, then immediately to Resonate
    address public override owner;
    
    /// Whether Resonate is in a disabled state
    bool public isPaused;

    uint private constant PRECISION = 1 ether;

    uint public constant FEE = 5;
    uint public constant DENOM = 100;

    /// Function selectors that are illegal to use. This is a one-way mapping and once blacklisted something cannot be un-blacklisted
    /// Blocks any attempts to whitelist function selectors on the blacklist
    mapping(uint32 => bool) blackListedFunctionSignatures;

    /// Function selectors that are allowed for arbitrary call execution
    mapping(uint32 => bool) whiteListedFunctionSignatures;

    /**
     * @notice The constructor called when ResonateHelper is deployed
     * @param _sandwichBot The address that is allowed to make arbitrary calls for passthrough governance
     * @dev Recommended to use a contract for sandwichBot with access control on it, rather than an EOA
     */
    constructor(address _sandwichBot) {
        SANDWICH_BOT_ADDRESS = _sandwichBot;
        owner = msg.sender;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(BREAKER, msg.sender);
        _setupRole(ADMIN, msg.sender);
        _setRoleAdmin(BREAKER, ADMIN);

        // Hardcoded blacklist entries
        blackListFunction(0x095ea7b3); // "approve(address,uint256)"
        blackListFunction(0x39509351); // "increaseAllowance(address,uint256)"
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyResonate() {
        require(msg.sender == owner, "ER024");
        _;
    }
    
    /**
     * @dev Throws if called by any account other than the sandwich bot
     */
    modifier onlySandwichBot() {
        require(msg.sender == SANDWICH_BOT_ADDRESS, "ER020");
        _;
    }

    /**
     * @dev Throws if the contract's operation has been paused
     */
    modifier glassUnbroken {
        require(!isPaused, "ER027");
        _;
    }



    ///
    /// Transactional Functions
    ///

    /**
     * @notice Triggers the withdrawal or deposit of vault-bound assets for purposes of metagovernance to/from their enclosing ISmartWallet instance
     * @param poolId The ID for the pool whose ISmartWallet instance should be targeted
     * @param amount The amount of tokens to withdraw/deposit to/from the ISmartWallet depository
     * @param isWithdrawal Whether these tokens are being removed for use in a vote (true) or being put back after a vote has been effected (false)
     * @dev This can only move tokens in and out of their associated vaults into and out of their associated depositories. It cannot transfer them elsewhere
     * @dev Requires correct MEV flashbots config to function as intended, withdrawal, vote, and deposit should occur within a single transaction
     */
    function sandwichSnapshot(
        bytes32 poolId, 
        uint amount, 
        bool isWithdrawal
    ) external override onlySandwichBot glassUnbroken {
        (,,address vaultAdapter,,,,) = IResonate(owner).pools(poolId);
        ISmartWallet(_getWalletForFNFT(poolId)).withdrawOrDeposit(vaultAdapter, amount, isWithdrawal);
    }

    /**
     * @notice Allows for arbitrary calls to be made via ISmartWallet depository contracts – intended to allow voting and bribes to function normally
     * @param poolId The poolId which the ISmartWallet contract is associated with
     * @param targets the contract(s) to target for the list of calls
     * @param values The Ether values to transfer (typically zero)
     * @param calldatas Encoded calldata for each function
     * @dev Calldata must be properly encoded and function selectors must be on the whitelist for this method to function. Functions cannot transfer tokens out
     */
    function proxyCall(bytes32 poolId, address[] memory targets, uint[] memory values, bytes[] memory calldatas) external onlySandwichBot glassUnbroken {
        for (uint256 i = 0; i < targets.length; i++) {
            require(calldatas[i].length >= 4, "ER028"); //Prevent calling fallback function for re-entry attack
            bytes memory selector = BytesLib.slice(calldatas[i], 0, 4);
            uint32 fxSelector = BytesLib.toUint32(selector, 0);
            require(whiteListedFunctionSignatures[fxSelector], "ER025");
        }
        (,address vault,address vaultAdapter,,,,) = IResonate(owner).pools(poolId);
        address asset = IERC4626(vaultAdapter).asset();
        ISmartWallet(_getWalletForFNFT(poolId)).proxyCall(asset, vault, vaultAdapter, targets, values, calldatas);
    }

    /**
     * @notice check if smart wallet is deployed, then return the address or deploy it.
     * @param poolId - the ID of the pool to retrieve the wallet for
     * @return wallet address of smartWallet
     */
    function getWalletForPool(bytes32 poolId) external override onlyResonate glassUnbroken returns (address wallet) {
        wallet = getAddressForPool(poolId);
        if(!_isContractDeployed(wallet)) {
            wallet = Clones.cloneDeterministic(POOL_TEMPLATE, poolId);
        }
    }
    /**
     * @notice check if smart wallet is deployed, then return the address or deploy it.
     * @param poolId - the Pool ID of the fnft to retrieve the wallet for
     * @return wallet address of smartWallet
     */
    function getWalletForFNFT(bytes32 poolId) external override onlyResonate glassUnbroken returns (address wallet) {
        wallet = _getWalletForFNFT(poolId);
    }

    /// Helper function for retrieving SmartWallet.sol pool deployment
    function _getWalletForFNFT(bytes32 poolId) private glassUnbroken returns (address wallet) {
        wallet = getAddressForFNFT(poolId);
        if(!_isContractDeployed(wallet)) {
            wallet = Clones.cloneDeterministic(FNFT_TEMPLATE, keccak256(abi.encode(poolId)));
        } 
    }

    ///
    /// Admin Functions
    ///
    
    /**
     * @notice called to set Resonate during deployment
     * @param resonate the Resonate.sol address for this deployment
     */
    function setResonate(address resonate) external override onlyResonate {
        require(FNFT_TEMPLATE == address(0));

        ResonateSmartWallet wallet = new ResonateSmartWallet(resonate);
        PoolSmartWallet poolWallet = new PoolSmartWallet(resonate);

        FNFT_TEMPLATE = address(wallet);
        POOL_TEMPLATE = address(poolWallet);

        address oldOwner = owner;
        owner = resonate;

        emit OwnershipTransferred(oldOwner, resonate);
    }

    /**
     * @notice one-way function to blacklist a function selector forever
     * @param selector the function selector to permanently blacklist
     * @dev this function permanently breaks the ability to call certain functions that are deemed 'dangerous'.
     *      It should be used sparingly, as it cannot be reversed. 
     *      It will also remove the passed-in selector from the whitelist.
     */
    function blackListFunction(uint32 selector) public onlyRole(ADMIN) {
        blackListedFunctionSignatures[selector] = true;
        if(whiteListedFunctionSignatures[selector]) {
            whiteListedFunctionSignatures[selector] = false;
        }
    }

    /**
     * @notice approves or disapproves a function for use in proxy call governance systems
     * @param selector the function selector to approve
     * @param isWhitelisted if we should add or remove whitelist status for the selector
     * @dev this function is less aggressive than blacklisting and should be used for everyday meta-governance operations
     */
    function whiteListFunction(uint32 selector, bool isWhitelisted) external onlyRole(ADMIN) {
        require(!blackListedFunctionSignatures[selector], "ER030");
        whiteListedFunctionSignatures[selector] = isWhitelisted;
    }

    ///
    /// EMERGENCY FUNCTIONS
    ///

    /// This function breaks the Revest Protocol, temporarily
    /// For use in emergency situations to offline deposits and withdrawals
    /// While making all value stored within totally inaccessible 
    /// Only requires one person to 'throw the switch' to disable entire protocol
    function breakGlass() external onlyRole(BREAKER) {
        isPaused = true;
    }


    /// Unpauses the token when the danger has passed
    /// Requires multisig governance system to agree to unpause
    function repairGlass() external onlyRole(ADMIN) {
        isPaused = false;
    }

    ///
    /// View Functions
    ///

    /**
     * @notice Determines the poolId that will be produced from a given set of parameters
     * @param asset payout asset of pool
     * @param vault underlying vault
     * @param adapter adapter for underlying vault
     * @param rate upfront payrout in e18
     * @param additionalRate additional rate for fixed return vaults in e18
     * @param lockupPeriod lockup period for fixed duration vaults
     * @param packetSize pool packetsize
     * @return poolId derived pool id
     */
    function getPoolId(
        address asset, 
        address vault,
        address adapter,
        uint128 rate,
        uint128 additionalRate,
        uint32 lockupPeriod, 
        uint packetSize
    ) external pure override returns (bytes32 poolId) {
        poolId = keccak256(abi.encodePacked(asset, vault, adapter, rate, additionalRate, lockupPeriod, packetSize));
    }

    /**
     * @notice Calculates the interest owed on an FNFT, excluding any residuals stored within that will require a withdrawal to retreive
     * @param fnftId the ID of the interest-bearing FNFT to check the interest on
     * @return interest A lower-bound estimate of the interest that making a claim will return
     * @return interestAfterFee A lower-bound estimate of the interest that the user will receive after fees are charged
     * @dev This will typically return lower-bound values because of the design of ERC-4626 preview functions to use lower-bounds 
     */
    function calculateInterest(uint fnftId) external view override returns (uint256 interest, uint256 interestAfterFee) {
        IResonate resonate = IResonate(owner);
        uint index = resonate.fnftIdToIndex(fnftId);

        (uint principalId, uint sharesPerPacket,, bytes32 poolId) = resonate.activated(index);
        (,, address vaultAdapter,,,, uint256 packetSize) = resonate.pools(poolId);
        IERC4626 vault = IERC4626(vaultAdapter);
        uint prinPackets = IFNFTHandler(IAddressRegistry(resonate.REGISTRY_ADDRESS()).getRevestFNFT()).getSupply(principalId);
        {
            uint assetShares = vault.previewWithdraw(prinPackets * packetSize); // shares for current principal
            uint totalShares = sharesPerPacket * prinPackets / PRECISION; // Shares you own, with recovered PRECISION

            if(totalShares < assetShares) {
                interest = 0;
            } else {
                // interest = delta of what you got at deposit and what they're worth now
                interest = vault.previewRedeem(totalShares - assetShares);
            }
        }
        
        uint residual = resonate.residuals(fnftId);
        if (residual > 0) {
            interest += vault.previewRedeem(residual);
        }

        interestAfterFee = interest- (interest * FEE / DENOM);
    } 

    /**
     * @notice get address of smart wallet for poolId
     * @param poolId pool id
     * @return smartWallet address of smartWallet
     */
    function getAddressForPool(bytes32 poolId) public view override glassUnbroken returns (address smartWallet) {
        smartWallet = Clones.predictDeterministicAddress(POOL_TEMPLATE, poolId);
    }
    /**
     * @notice get address of smart wallet for fnft id
     * @param fnftId fnft id
     * @return smartWallet address of smartWallet
     */
    function getAddressForFNFT(bytes32 fnftId) public view override glassUnbroken returns (address smartWallet) {
        smartWallet = Clones.predictDeterministicAddress(FNFT_TEMPLATE, keccak256(abi.encode(fnftId)));
    }
    /**
     * @notice return the next order in the specified queue
     * @param poolId which pool to look in
     * @param isProvider specify which queue to look in
     * @return order next order in the queue
     */
    function nextInQueue(bytes32 poolId, bool isProvider) external view override returns (IResonate.Order memory order) {
        IResonate resonate = IResonate(owner);
        IResonate.PoolQueue memory queue;
        {
            (uint64 a, uint64 b, uint64 c, uint64 d) = resonate.queueMarkers(poolId);
            queue = IResonate.PoolQueue(a,b,c,d);
        }
        if(isProvider) { 
            (uint a,uint b,bytes32 c) = resonate.providerQueue(poolId, queue.providerHead);
            order = IResonate.Order(a,b,c);
        } else {
           (uint a,uint b,bytes32 c) = resonate.consumerQueue(poolId, queue.consumerHead);
            order = IResonate.Order(a,b,c);
        }
    }

    function isQueueEmpty(bytes32 poolId, bool isProvider) external view override returns (bool isEmpty) {
        IResonate resonate = IResonate(owner);
        IResonate.PoolQueue memory qm;
        {
            (uint64 a, uint64 b, uint64 c, uint64 d) = resonate.queueMarkers(poolId);
            qm = IResonate.PoolQueue(a,b,c,d);
        }
        isEmpty = isProvider ? qm.providerHead == qm.providerTail : qm.consumerHead == qm.consumerTail;
    }

    function _isContractDeployed(address checkAdd) private view returns (bool isDeployed) {
        uint32 size;
        assembly {
            size := extcodesize(checkAdd)
        }
        isDeployed = size > 0;
    }

}