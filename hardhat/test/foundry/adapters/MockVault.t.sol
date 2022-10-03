/*
pragma solidity >= 0.8.0;

import "./GenericAdapter.t.sol";
import "contracts/mocks/MockERC20.sol";
import "contracts/interfaces/IERC4626.sol";
import "contracts/mocks/RariVault.sol";
import "contracts/lib/ERC20.sol";

contract MockVaultTest is AdapterTest {
    constructor() AdapterTest(deploy(), 1) {
    }
    // deploy and return the adapter in this function
    function deploy() public returns (IERC4626) {
        ERC20 mock20 = new Mock20();

        RariVault rari = new RariVault(mock20);
        return IERC4626(address(rari));
    }

    // Apparently necessary to kick-off inherited tests
    function test() public {}

    function appreciateVault(uint amount) public virtual override {
        hoax(angel, angel);
        asset.transfer(address(adapter), amount);
    }    
    
    function testInterest_deposit_redeem(uint amount) public {
        // Deposit
        vm.assume(amount < 1e36 && amount > 0);

        startHoax(alice, alice);
        asset.approve(address(adapter), amount);
        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = asset.balanceOf(address(adapter));

        uint previewDeposit = adapter.previewDeposit(amount);
        uint shares = adapter.deposit(amount, alice);

        assertEq(asset.balanceOf(alice), aliceBalance - amount);
        assertEq(asset.balanceOf(address(adapter)), adapterBalance + amount);
        assertEq(previewDeposit, shares);
        vm.stopPrank();

        // Appreciate Vault
        appreciateVault(amount);
        uint sharePrice = adapter.convertToAssets(shares);

        // Redeem
        startHoax(alice, alice);
        asset.approve(address(adapter), shares);
        uint previewRedeem = adapter.previewRedeem(shares);
        uint finalAssets = adapter.redeem(amount, alice, alice);
        assertApproxEqAbs(asset.balanceOf(alice), aliceBalance - amount + sharePrice, tolerance);
        assertApproxEqAbs(asset.balanceOf(address(adapter)), adapterBalance + amount + amount - sharePrice, tolerance);
        assertEq(previewRedeem, finalAssets);
    }

    function testInterest_mint_withdraw(uint amount) public {
        // Mint
        vm.assume(amount < 1e36 && amount > 0);

        startHoax(alice, alice);
        asset.approve(address(adapter), amount);
        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = asset.balanceOf(address(adapter));

        uint previewMint = adapter.previewMint(amount);
        uint assets = adapter.mint(amount, alice);

        assertEq(asset.balanceOf(alice), aliceBalance - amount);
        assertEq(asset.balanceOf(address(adapter)), adapterBalance + amount);
        assertEq(previewMint, assets);
        vm.stopPrank();

        // Appreciate Vault
        appreciateVault(amount);
        uint shares = adapter.convertToAssets(assets);

        // Redeem
        startHoax(alice, alice);
        asset.approve(address(adapter), assets);
        uint previewRedeem = adapter.previewRedeem(assets);
        uint finalAssets = adapter.redeem(assets, alice, alice);
        assertApproxEqAbs(asset.balanceOf(alice), aliceBalance - amount + shares, tolerance);
        assertApproxEqAbs(asset.balanceOf(address(adapter)), adapterBalance + amount + amount - shares, tolerance);
        assertEq(previewRedeem, finalAssets);
    }
}
*/