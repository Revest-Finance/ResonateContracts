// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8;

import {ERC20} from "../../../lib/ERC20.sol";

interface IBufferBinaryPool {
    function balanceOf(address addr) external view returns (uint balance);    
    function tokenX() external returns (ERC20 tokenX);
    function totalTokenXBalance() external view returns (uint256 amount);
    function maxLiquidity() external view returns (uint256 max);
    function totalSupply() external view returns (uint256 supply);

    function provide(uint256 tokenXAmount, uint256 minMint) external returns (uint256 mint);
    function withdraw(uint256 tokenXAmount) external;
}