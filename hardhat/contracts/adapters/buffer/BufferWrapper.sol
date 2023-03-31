// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.12;

import {ERC4626, SafeTransferLib, ERC20} from "../../lib/ERC4626.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {IBufferBinaryPool} from "../../interfaces/adapters/misc/IBufferBinaryPool.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @author 0xTinder
 * @notice a contract for providing Buffer Finance's BufferBinaryPool contracts with an ERC-4626-compliant interface
 *         Developed for Resonate.
 * @dev The initial 1000 shares of this contract should be burned immediately following deployment.
 */
contract BufferWrapper is ERC4626 {
    using SafeTransferLib for ERC20;
    IBufferBinaryPool public immutable pool;


    error InsufficientFundsWithdrawnFromPool();

    constructor(IBufferBinaryPool _pool)
        ERC4626(
            _pool.tokenX(),
            "Buffer-4646-Adapter",
            "Buffer-4646"
        )
    {
        pool = _pool;

        asset.approve(address(_pool), type(uint).max);
    }


    /*//////////////////////////////////////////////////////////////
                    DEPOSIT/WITHDRAWAL LIMIT LOGIC
  //////////////////////////////////////////////////////////////*/

    function maxDeposit(address)
        public
        view
        override
        returns (uint256)
    {
        return pool.maxLiquidity() - pool.totalTokenXBalance();
    }

    function maxMint(address)
        public
        view
        override
        returns (uint256 shares)
    {
        return convertToShares(maxDeposit(msg.sender));
    }

    function maxWithdraw(address owner)
        public
        view
        override
        returns (uint256)
    {
        return convertToAssets(this.balanceOf(owner));
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return this.balanceOf(owner);
    }

    /*//////////////////////////////////////////////////////////////
                      ERC4626 compatibility
   //////////////////////////////////////////////////////////////*/
    function totalAssets() public view override returns (uint256) {
        return pool.balanceOf(address(this)) * pool.totalTokenXBalance() / pool.totalSupply();
    }

    function afterDeposit(uint256 assets, uint256) internal override {
        uint256 minMint = (assets * pool.totalSupply()) / pool.totalTokenXBalance();
        pool.provide(assets, minMint);
    }

    function beforeWithdraw(uint256 assets, uint256) internal override {
        uint256 balance = asset.balanceOf(address(this));
        pool.withdraw(assets);
        ///@dev require no less than `assets` received from BinaryPool, to prevent overdraft
        if (balance + assets != asset.balanceOf(address(this))) revert InsufficientFundsWithdrawnFromPool();
    }
}