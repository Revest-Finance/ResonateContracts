pragma solidity >= 0.8.0;

import "forge-std/Test.sol";
import "./GenericAdapter.t.sol";


contract ReaperWrapperTest is AdapterTest {

    ReaperWrapper ReaperAdapter;
    address cryptFantom = 0xa14cD844Afb46a4aC87B2DA710f94738828Ee07C;
    address cryptOptimism = 0x4f086A048c33f3BF9011dd2265861ce812624f2c;
    address DUST = 0x8cA573430Fd584065C080fF1d2eA1a8DfB259Ae8;

    constructor() AdapterTest(IERC4626(setupAdapter(cryptFantom)), tolerance) {

    }

    function setupAdapter(address crypt) public returns (address) {
        ReaperAdapter = new ReaperWrapper(cryptFantom,DUST);// = new ReaperWrapper(0x4f086A048c33f3BF9011dd2265861ce812624f2c);
        // console2.log("Adapter: ", address(ReaperAdapter));
        vault = ReaperAdapter.vault();
        return address(ReaperAdapter);
    }

    /*
    These tests needed to be Overriden because Reaper Farm auto-deposits into TAROT and so the assertEq \
    needed to be replaced with assertGt
    */

    // Test the deposit functionality
    function testDeposit(uint amount) public override {
        vm.assume(amount < 1e36 && amount > 1e18);

        startHoax(alice, alice);
        asset.approve(address(adapter), type(uint).max);

        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = asset.balanceOf(address(adapter));
        uint vaultBalance = asset.balanceOf(vault);

        uint preview = adapter.previewDeposit(amount);
        // console2.log(asset.balanceOf(alice));

        console2.log("--- about to deposit ---");

        uint deposit = adapter.deposit(amount, alice);
        // console2.log(asset.balanceOf(alice));

        // console2.log("--- after deposit ---");

        console2.log("deposit passed in test");

        assertEq(asset.balanceOf(alice), aliceBalance - amount, "Alice's account did not decrease by correct amount");
        assertGt(adapter.balanceOf(alice), 0, "Alice's Shares should not be zero");
        assertEq(adapter.balanceOf(alice), preview, "Shares minted to alice does not match quote");

        assertGt(IERC20(vault).balanceOf(address(ReaperAdapter)), 0, "Adapter Balance should not be zero");

        assertGe(deposit, preview, "Alice shares should be deposit >= previewDeposit");
    }

    //test the mint function - Just mint some amount of tokens
    function testMint(uint amount) public override {
        vm.assume(amount < 1e36 && amount > 1e18); //picks some amount of tokens

        startHoax(alice, alice);

        uint preview = adapter.previewDeposit(amount); //how many shares can you get for amount of tokens
        asset.approve(address(adapter), type(uint).max); //approve 

        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = asset.balanceOf(address(adapter));

        uint previewMint = adapter.previewMint(amount);
        uint assetsUsedtoMint = adapter.mint(amount, alice); //returns number of assets used to mint preview-shares

        assertEq(asset.balanceOf(alice), aliceBalance - assetsUsedtoMint, "Alice's Asset balance did not decrease correctly");
        assertGt(IERC20(vault).balanceOf(address(adapter)), 0, "Adapter Share balance should not be zero");

        assertLe(assetsUsedtoMint, previewMint, "Assets used to mint should be >= previewMint");
        assertApproxEqRel(amount, assetsUsedtoMint, 0.001e18, "Amount quoted does not match amount minted"); //Within .1% accuracy

    }

    //Test a deposit and withdraw some amount less than deposit
    function testWithdraw(uint amount, uint withdrawAmount) public virtual override {


        vm.assume(amount < 1e36 && amount > 1e18);
        vm.assume(withdrawAmount < amount && withdrawAmount >= 1e18);

        startHoax(alice, alice);

        asset.approve(address(adapter), amount);
        uint shares_received = adapter.deposit(amount, alice);

        uint aliceBalance = asset.balanceOf(alice);
        uint adapterBalance = IERC20(vault).balanceOf(address(adapter));

        uint preview = adapter.previewWithdraw(withdrawAmount);

        if(preview > adapter.balanceOf(alice)) {
            vm.expectRevert(IVaultWrapper.NotEnoughAvailableSharesForAmount.selector);
            adapter.withdraw(amount, alice, alice);
        } else {
            uint shares_burnt = adapter.withdraw(withdrawAmount, alice, alice);
            assertApproxEqAbs(asset.balanceOf(alice), aliceBalance + withdrawAmount, tolerance, "Tokens not returned to alice from withdrawal");
            assertLt(IERC20(vault).balanceOf(address(adapter)), adapterBalance, "Adapter Balance did not decrease");
            assertLe(shares_burnt, preview, "Shares actually burned should be <= previewWithdraw");
        }
    }

    
    function testRedeem(uint amount, uint redeemAmount) public virtual override{
        vm.assume(amount < 1e36 && amount > 1e18);
        vm.assume(redeemAmount <= amount && redeemAmount >= 1e18);

        startHoax(alice, alice);

        asset.approve(address(adapter), type(uint).max);
        uint shares_received = adapter.mint(amount, alice);

        uint aliceTokenBalance = asset.balanceOf(alice);
        uint aliceAdapterBalance = adapter.balanceOf(alice);
        uint adapterBalance = IERC20(vault).balanceOf(address(adapter));

        uint previewRedeem = adapter.previewRedeem(redeemAmount); //expected assets gotten from redemption
        require(previewRedeem > 0);
        
        uint redeem = adapter.redeem(redeemAmount, alice, alice); //assets used to redeem that many shares
        
        assertGe(redeem, previewRedeem, "Actual assets used in redeem should be >= than those in previewRedeem");
        assertApproxEqRel(asset.balanceOf(alice), aliceTokenBalance + previewRedeem, 0.001e18, "Correct amount of tokens not returned to alice");

        assertLt(IERC20(vault).balanceOf(address(adapter)), adapterBalance, "Adapter Balance did not decrease");
        assertLt(adapter.balanceOf(alice), aliceAdapterBalance, "Alice's share balance did not decrease");
        
        assertApproxEqRel(asset.balanceOf(alice), aliceTokenBalance + previewRedeem, 0.001e18, "Alice Token Balance Did not increase correctly");
        assertApproxEqRel(previewRedeem, redeem, 0.001e18, "Shares redeemed does not equal shares quotes to be redeemed");

    }

    // Round trips
    function testRoundTrip_deposit_withdraw(uint amount) public virtual override {
        // Deposit
        vm.assume(amount < 1e36 && amount >= 1e18);

        startHoax(alice, alice);
        asset.approve(address(adapter), type(uint).max);
        uint initAliceBalance = asset.balanceOf(alice);
        uint initadapterBalance = asset.balanceOf(address(adapter));

        uint previewDeposit = adapter.previewDeposit(amount);
        uint deposit = adapter.deposit(amount, alice);

        assertEq(asset.balanceOf(alice), initAliceBalance - amount, "improper amount decreased from alice's address");
        // assertEq(asset.balanceOf(address(adapter)), initadapterBalance + amount, "");
        assertGt(IERC20(vault).balanceOf(address(adapter)), 0, "Adapter share balance shouldn't be zero");
        assertEq(adapter.balanceOf(alice), previewDeposit, "Alice share value does not match quoted amount");
        assertEq(previewDeposit, deposit, "amount quoted to mint not matching actually minted amount");
        
        // Withdraw
        uint vaultPreBalance = IERC20(vault).balanceOf(address(adapter));
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
        assertGt(IERC20(vault).balanceOf(address(adapter)), 0, "Adapter share balance shouldn't be zero");
        assertGt(adapter.balanceOf(alice), 0, "Alice Share value should not be zero");
        assertEq(previewMint, mint, "assets quoted to be transferred not matching actual amount");

        // Redeem
        uint previewRedeem = adapter.previewRedeem(amount);
        uint shares_converted = adapter.redeem(amount, alice, alice);

        /// TODO: Make delta PROPORTIONAL
        //assertApproxEqAbs(asset.balanceOf(alice), initAliceBalance, tolerance, "alice balance of assets not the same at the end of test");
        assertApproxEqAbs(asset.balanceOf(address(adapter)), initadapterBalance, tolerance, "adapter balance is not same at end of test");
        assertApproxEqAbs(previewRedeem, shares_converted, tolerance, "assets actually transferred to burn not same as quoted amount");
        
    }   

}