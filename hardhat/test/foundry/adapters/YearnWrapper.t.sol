pragma solidity >= 0.8.0;

import "forge-std/Test.sol";
import "contracts/adapters/yearn/YearnWrapper.sol";
import 'hardhat/console.sol';

//forge test --fork-url https://eth-mainnet.alchemyapi.io/v2/zOVFUzSEld1v_MuTOqGPYkTYttwBUrmF --fork-block-number 15564000 --match-contract YearnWrapperTest -vv

contract YearnWrapperTest is Test {
    // https://ftmscan.com/address/0x91155c72ea13BcbF6066dD161BECED3EB7c35e35
    address vault = address(0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE);
    VaultAPI vaultAPI = VaultAPI(vault);
    address angel = address(1);


    YearnWrapper adapter;

    uint immutable tolerance = 100;

    ERC20 USDC = ERC20(address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48));
    address alice = address(15);
    address bob = address(14);

    constructor() public {
        adapter = new YearnWrapper(vaultAPI);
        vm.label(vault, "vault");
        vm.label(address(adapter), "adapter");
    }


    function test_basic_migrate() public {
        uint amount = 1e6;

        // Record deposits
        startHoax(alice, alice);
        deal(address(USDC), alice, amount);
        USDC.approve(address(adapter), amount);
        adapter.deposit(amount, alice);
        vm.stopPrank();

        uint _preMigrateAdapterBal = vaultAPI.balanceOf(address(adapter));
        uint _preMigrateAliceBal = adapter.balanceOf(alice);

        adapter.migrate(vault);

        uint _postMigrateAdapterBal = vaultAPI.balanceOf(address(adapter));
        uint _postMigrateAliceBal = adapter.balanceOf(alice);

        assertApproxEqAbs(_preMigrateAdapterBal, _postMigrateAdapterBal, tolerance);
        assertApproxEqAbs(_preMigrateAliceBal, _postMigrateAliceBal, tolerance);

        startHoax(alice, alice);
        uint needed_shares = adapter.previewWithdraw(amount / 2);

        assertLe(needed_shares, adapter.balanceOf(alice), "Alice does not have enough shares to withdraw");

        adapter.redeem(needed_shares, alice, alice);
        assertApproxEqAbs(USDC.balanceOf(alice), amount / 2, tolerance);
        assertApproxEqAbs(adapter.balanceOf(alice), _postMigrateAliceBal / 2, tolerance);
        vm.stopPrank();
    }
    /// @dev same test with multiple depositors/withdrawals
    function test_multi_migrate() public {
        uint amount = 1e6;

        uint _startAdapterBal = vaultAPI.balanceOf(address(adapter));
        // Record deposits
        startHoax(alice, alice);
        deal(address(USDC), alice, amount);
        USDC.approve(address(adapter), amount);
        adapter.deposit(amount, alice);
        vm.stopPrank();

        startHoax(bob, bob);
        deal(address(USDC), bob, amount);
        USDC.approve(address(adapter), amount);
        adapter.deposit(amount, bob);
        vm.stopPrank();

        uint _preMigrateAdapterBal = vaultAPI.balanceOf(address(adapter));
        uint _preMigrateAliceBal = adapter.balanceOf(alice);
        uint _preMigrateBobBal = adapter.balanceOf(bob);

        adapter.migrate(vault);

        uint _postMigrateAdapterBal = vaultAPI.balanceOf(address(adapter));
        uint _postMigrateAliceBal = adapter.balanceOf(alice);
        uint _postMigrateBobBal = adapter.balanceOf(bob);

        assertApproxEqAbs(_preMigrateAdapterBal, _postMigrateAdapterBal, tolerance);
        assertApproxEqAbs(_preMigrateAliceBal, _postMigrateAliceBal, tolerance);
        assertApproxEqAbs(_preMigrateBobBal, _postMigrateBobBal, tolerance);

        startHoax(alice, alice);
        uint needed_shares = adapter.previewWithdraw(amount / 2);
        assertLe(needed_shares, adapter.balanceOf(alice), "Alice does not have enough shares to withdraw");
        
        adapter.redeem(needed_shares, alice, alice);

        assertApproxEqAbs(USDC.balanceOf(alice), amount / 2, tolerance);
        assertApproxEqAbs(adapter.balanceOf(alice), _postMigrateAliceBal / 2, tolerance);
        vm.stopPrank();

        startHoax(bob, bob);
        needed_shares = adapter.previewWithdraw(amount / 2);
        assertLe(needed_shares, adapter.balanceOf(bob), "Alice does not have enough shares to withdraw");

        adapter.redeem(needed_shares, bob, bob);
        assertApproxEqAbs(USDC.balanceOf(bob), amount / 2, tolerance);
        assertApproxEqAbs(adapter.balanceOf(bob), _postMigrateBobBal / 2, tolerance);
        vm.stopPrank();
    }

    function testFail_evil_migrate() public {
        address evil = address(13);
        startHoax(evil, evil);
        adapter.migrate(vault);
    }

    function testFail_invalid_migrate() public {
        startHoax(alice, alice);
        adapter.migrate(address(10));
    }
}