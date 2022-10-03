// SPDX-License-Identifier: MIT

pragma solidity >=0.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVaultV1 is IERC20 {

    function deposit(uint256 amount) external;

    function withdraw(uint256 shares) external;
    
    /// View Methods

    function balance() external view returns (uint256);

    function totalAssets() external view returns (uint256);

    function strategy() external view returns (address);
    
    function getPricePerFullShare() external view returns (uint256);

    function name() external view returns (string calldata);

    function symbol() external view returns (string calldata);

    function decimals() external view returns (uint256);



}