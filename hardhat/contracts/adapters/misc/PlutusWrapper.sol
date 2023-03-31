// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import "../../mocks/RariVault.sol";
import "../../interfaces/adapters/misc/IPlutusWrapper.sol";
import "../../lib/ERC4626.sol";

// import "forge-std/console2.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "../../lib/FixedPointMathLib.sol";


contract PlutusWrapper is RariVault {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    ERC20 public immutable plsGLP;

    constructor(ERC20 _asset, address _plsGLP) RariVault(_asset) {
        plsGLP = ERC20(_plsGLP);
    }

    function totalAssets() public view virtual override returns(uint) {

        //Tracks the underlying amount of plsGLP claimable by the vault
        return ERC4626(address(asset)).maxWithdraw(address(this));
    }


    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override nonReentrant returns (uint256 shares) {
        shares = previewWithdraw(assets); // No need to check for rounding error, previewWithdraw rounds up.

        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender]; // Saves gas for limited approvals.

            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }

        beforeWithdraw(assets, shares);

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        asset.safeTransfer(receiver, assets);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override nonReentrant returns (uint256 assets) {
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender]; // Saves gas for limited approvals.

            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }

        require((assets = previewRedeem(shares)) != 0, "ZERO_ASSETS");

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        asset.safeTransfer(receiver, assets);
    }

    function previewWithdraw(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256)
    {
        uint supply = totalSupply;
        uint conversion = ERC4626(address(asset)).convertToAssets(assets); //convert plvGLP to plsGLP Equivalent
        return supply == 0 ? conversion : conversion.mulDivDown(supply, totalAssets()); 
    }

    function previewMint(uint256 shares)
        public
        view
        override
        returns (uint256)
    {
        uint supply = totalSupply;
        uint localAssets = totalAssets();
        return supply == 0 ? shares : ERC4626(address(asset)).convertToShares(shares.mulDivUp(totalAssets(), supply));
    }

    function convertToAssets(uint256 shares) public view virtual override returns (uint256) {
        uint256 supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.

        //Since totalAssets() is in terms of plsGLP we just convert it back to plsGLP
        return supply == 0 ? shares : ERC4626(address(asset)).convertToShares(shares.mulDivUp(totalAssets(), supply));
    }

    function convertToShares(uint256 assets) public view virtual override returns (uint256) {
        uint256 supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.

        uint conversion = ERC4626(address(asset)).convertToAssets(assets); //convert plvGLP to plsGLP Equivalent
        return supply == 0 ? assets : conversion.mulDivDown(supply, totalAssets());
    }

}