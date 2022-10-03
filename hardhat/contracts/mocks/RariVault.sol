// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;
import "../lib/ERC4626.sol";

contract RariVault is ERC4626 {
    constructor(
        ERC20 _asset
    ) ERC4626(_asset, "RariVault", "RV") {}

    function totalAssets() public view virtual override returns (uint256) {
        return asset.balanceOf(address(this));
    }
}