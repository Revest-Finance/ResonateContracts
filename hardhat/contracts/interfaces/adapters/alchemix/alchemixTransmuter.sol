pragma solidity ^0.8.13;

import "../../IERC4626.sol";

interface alchemixTransmuter {
    function claim(uint256 amount, address recipient) external;
    function getClaimableBalance(address owner) external view returns (uint256 claimableBalance);
    function getUnexchangedBalance(address owner) external view returns (uint256 unexchangedBalance);

    function deposit(uint amountUnderlying, address receiver) external;
    function withdraw(uint256 amount, address recipient) external;

}