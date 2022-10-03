pragma solidity >= 0.8.0;

import "forge-std/Test.sol";
import "./GenericAdapter.t.sol";

contract BeefyWrapperTest is AdapterTest {

    BeefyWrapper BeefyAdapter;
    address BeefyVaultFantom = 0xE7E08D82853dcf1057B2f8BCeF781d904602B6a0;
    // address BeefyVaultFantom = 0xedEb044BC7Ce11Dfa436CFA8Be43e6eB0d601814;
    address DUST = 0x8cA573430Fd584065C080fF1d2eA1a8DfB259Ae8;

    // REFERENCE => Confidence Interval = 0.001e18 = 0.1%

    constructor() AdapterTest(IERC4626(setupAdapter(BeefyVaultFantom)), tolerance) {

    }

    function setupAdapter(address vault) public returns (address) {
        BeefyAdapter = new BeefyWrapper(BeefyVaultFantom, DUST);// = new ReaperWrapper(0x4f086A048c33f3BF9011dd2265861ce812624f2c);
        // console2.log("Adapter: ", address(BeefyAdapter));
        vault = BeefyAdapter.vault();
        return address(BeefyAdapter);
    }

    function testDeposit(uint amount) public virtual override {
        vm.assume(amount < 1e30 && amount > 1e18);

        startHoax(alice, alice);
        asset.approve(address(adapter), amount);

        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = asset.balanceOf(address(adapter));
        uint vaultBalance = asset.balanceOf(vault);

        uint preview = adapter.previewDeposit(amount);
        uint shares_minted = adapter.deposit(amount, alice);

        assertEq(asset.balanceOf(alice), aliceBalance - amount, "Alice Balance of Asset did not decrease by desired amount");
        assertGt(adapter.balanceOf(alice), 0, "Alice Balance should not be zero");

        // assertEq(adapter.balanceOf(alice), shares_minted, "Alice's Share balance does not match shares minted");
        // console.log("balance adapter: ", IERC20(vault).balanceOf(address(BeefyAdapter)));

        // assertGt(IERC20(vault).balanceOf(address(BeefyAdapter)), 0, "Adapter Share balance should not be zero");
        assertEq(asset.balanceOf(address(vault)), vaultBalance, "Vault Appreciated, it shouldn't have");
        assertGt(IERC20(BeefyVaultFantom).balanceOf(address(adapter)), 0, "Adapter Share Balance should not be zero");
        assertApproxEqAbs(preview, shares_minted, tolerance, "shares expected not matching shares minted to Alice");

        assertGe(shares_minted, preview, "deposit NOT >= previewDeposit");
    }

    //test the mint function - Just mint some amount of tokens
    function testMint(uint amount) public override {
        vm.assume(amount < 1e30 && amount > 1e18); //picks some amount of tokens

        startHoax(alice, alice);

        uint preview = adapter.previewDeposit(amount); //how many shares can you get for amount
        asset.approve(address(adapter), type(uint).max); //approve 

        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = asset.balanceOf(address(adapter));
        
        uint previewMint = adapter.previewMint(preview);
        uint mint = adapter.mint(preview, alice); //returns number of assets used to mint preview-shares

        assertEq(asset.balanceOf(alice), aliceBalance - mint, "Alice's Asset balance did not decrease correctly");
        assertGt(IERC20(BeefyVaultFantom).balanceOf(address(adapter)), 0, "Adapter Share Balance should not be zero");
        assertApproxEqRel(amount, mint, 0.001e18, "Amount quoted does not match amount minted"); //Within .01% accuracy

        assertLe(mint, previewMint, "previewMint NOT >= mint");

    }

    //Test a deposit and withdraw some amount less than deposit
    function testWithdraw(uint amount, uint withdrawAmount) public virtual override {
        vm.assume(amount < 1e36 && amount > 1e18);
        vm.assume(withdrawAmount < amount && withdrawAmount >= 1e18);

        startHoax(alice, alice);

        asset.approve(address(adapter), amount);
        uint shares_received = adapter.deposit(amount, alice);

        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = IERC20(BeefyVaultFantom).balanceOf(address(BeefyAdapter));

        uint preview = adapter.previewWithdraw(withdrawAmount);

        console2.log("preview: ", preview);
        console2.log("alice shares: ", adapter.balanceOf(alice));

        if (preview > adapter.balanceOf(alice)) {
            vm.expectRevert(IVaultWrapper.NotEnoughAvailableSharesForAmount.selector);
            adapter.withdraw(amount, alice, alice);
        } else {
            uint shares_burnt = adapter.withdraw(withdrawAmount, alice, alice);
            assertApproxEqAbs(asset.balanceOf(alice), aliceBalance + withdrawAmount, tolerance, "Tokens not returned to alice from withdrawal");
            assertLt(IERC20(BeefyVaultFantom).balanceOf(address(adapter)), adapterBalance, "Adapter Balance did not decrease");
            assertLe(shares_burnt, preview, "Shares actually burned should be <= previewWithdraw");
        }
    }

    function testRedeem(uint256 amount, uint256 redeemAmount) public virtual override {
        vm.assume(amount < 1e36 && amount > 1e18);
        vm.assume(redeemAmount <= amount && redeemAmount >= 1e18);

        startHoax(alice, alice);

        asset.approve(address(adapter), type(uint).max);
        uint shares_received = adapter.mint(amount, alice);

        uint aliceTokenBalance = asset.balanceOf(alice);
        uint aliceAdapterBalance = adapter.balanceOf(alice);
        uint adapterBalance = IERC20(BeefyVaultFantom).balanceOf(address(adapter));

        uint previewRedeem = adapter.previewRedeem(redeemAmount);
        uint redeem = adapter.redeem(redeemAmount, alice, alice);

        assertGe(redeem, previewRedeem, 'Redeem >= previewRedeem ERC4626');

        assertApproxEqRel(asset.balanceOf(alice), aliceTokenBalance + previewRedeem, 0.001e18, "Correct amount of tokens not returned to alice");

        assertLt(IERC20(BeefyVaultFantom).balanceOf(address(adapter)), adapterBalance, "Adapter Balance did not decrease");
        assertLt(adapter.balanceOf(alice), aliceAdapterBalance, "Alice's share balance did not decrease");
        assertApproxEqRel(asset.balanceOf(alice), aliceTokenBalance + previewRedeem, 0.001e18, "Alice Token Balance Did not increase correctly");
        assertApproxEqRel(previewRedeem, redeem, 0.001e18, "Shares redeemed does not equal shares quotes to be redeemed");

    }

    // Round trips
    function testRoundTrip_deposit_withdraw(uint amount) public virtual override {
        // Deposit
        vm.assume(amount < 1e36 && amount > 1e18);

        startHoax(alice, alice);
        asset.approve(address(adapter), type(uint).max);
        uint initAliceBalance = asset.balanceOf(alice);
        uint initadapterBalance = asset.balanceOf(address(adapter));

        uint previewDeposit = adapter.previewDeposit(amount);
        uint deposit = adapter.deposit(amount, alice);

        assertApproxEqAbs(asset.balanceOf(alice), initAliceBalance - amount, tolerance, "improper amount decreased from alice's address");
        // assertEq(asset.balanceOf(address(adapter)), initadapterBalance + amount, "");
        assertGt(IERC20(BeefyVaultFantom).balanceOf(address(adapter)), 0, "Adapter share balance shouldn't be zero");
        assertApproxEqAbs(adapter.balanceOf(alice), previewDeposit, tolerance, "Alice share value does not match quoted amount");
        assertApproxEqAbs(previewDeposit, deposit, tolerance ,"amount quoted to mint not matching actually minted amount");
        
        // Withdraw
        uint vaultPreBalance = IERC20(BeefyVaultFantom).balanceOf(address(adapter));
        uint previewWithdraw = adapter.previewWithdraw(amount);

        if(previewWithdraw > adapter.balanceOf(alice)) {
            vm.expectRevert(IVaultWrapper.NotEnoughAvailableSharesForAmount.selector);
            adapter.withdraw(amount, alice, alice);

        } else {
            uint shares_burnt = adapter.withdraw(amount, alice, alice);

            assertApproxEqAbs(asset.balanceOf(alice), initAliceBalance, tolerance, "alice balance of assets not the same at the end of test");
            assertApproxEqAbs(asset.balanceOf(address(adapter)), initadapterBalance, tolerance, "adapter balance is not same at end of test");
            assertApproxEqAbs(previewWithdraw, shares_burnt, tolerance, "shares burnt does not match quoted burn amount");
            assertLt(IERC20(vault).balanceOf(address(adapter)), vaultPreBalance, "Adapter share balance did not decrease");
        }
    }

    function testRoundTrip_mint_redeem(uint amount) public virtual override {
        // Mint
        vm.assume(amount < 1e36 && amount > 1e18);

        startHoax(alice, alice);
        asset.approve(address(adapter), type(uint).max);
        uint initAliceBalance = asset.balanceOf(alice);
        uint initadapterBalance = asset.balanceOf(address(adapter));

        uint previewMint = adapter.previewMint(amount);
        uint mint = adapter.mint(amount, alice);

        assertEq(asset.balanceOf(alice), initAliceBalance - previewMint, "Alice's token balance not decreased by proper amount");
        assertGt(IERC20(BeefyVaultFantom).balanceOf(address(adapter)), 0, "Adapter share balance shouldn't be zero");
        assertGt(adapter.balanceOf(alice), 0, "Alice Share value should not be zero");
        assertEq(previewMint, mint, "assets quoted to be transferred not matching actual amount");

        // Redeem
        uint previewRedeem = adapter.previewRedeem(amount);
        uint assets_converted = adapter.redeem(amount, alice, alice);

        assertApproxEqRel(asset.balanceOf(alice), initAliceBalance, 0.001e18, "alice balance of assets not the same at the end of test");
        assertApproxEqRel(asset.balanceOf(address(adapter)), initadapterBalance, 0.001e18, "adapter balance is not same at end of test");

        assertGe(assets_converted, previewRedeem, "redeem NOT >= previewRedeem");
        assertApproxEqRel(previewRedeem, assets_converted, 0.001e18, "assets actually transferred to burn not same as quoted amount");
    }

}