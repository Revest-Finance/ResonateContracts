pragma solidity >= 0.8.0;

import "./ETHResonate.t.sol";
import "contracts/mocks/RariVault.sol";

contract ClaimInterestTest is ETHResonateTest {
    bytes32 poolId1;
    bytes32 poolId2;

    IERC4626 vault1;
    IERC4626 vault2;
    RariVault rari1;
    RariVault rari2;
    address alice = address(2e9); // random
    address bob = address(2e10); // 
    address angel = address(2e11);
    uint fee = 3;
    uint denom = 100;

   
    // Runs once at the state => before()
    constructor() ETHResonateTest() {
        startHoax(alice, alice);
        DAI.approve(address(resonate), ~uint256(0));
        USDC.approve(address(resonate), ~uint256(0));
        vm.stopPrank();
        startHoax(bob, bob);
        DAI.approve(address(resonate), type(uint).max);
        USDC.approve(address(resonate), type(uint).max);
        vm.stopPrank();
        vm.label(alice, "alice");
        vm.label(bob, "bob");
        vm.label(angel, "angel");
        deal(address(DAI), alice, 1000e18);
        deal(address(DAI), bob, 1000e18);
        deal(address(DAI), angel, type(uint).max);
        deal(address(USDC), alice, 1000e6);
        deal(address(USDC), bob, 1000e6);
        deal(address(USDC), angel, type(uint).max);
        
        rari1 = new RariVault(DAI);
        vault1 = IERC4626(address(rari1));
        
        rari2 = new RariVault(USDC);
        vault2 = IERC4626(address(rari2));

        resonate.modifyVaultAdapter(address(rari1), address(vault1));
        resonate.modifyVaultAdapter(address(rari2), address(vault2));
            
        poolId1 = resonate.createPool(address(DAI), address(rari1), 7e16, 0, 86400, 1000e18, "Pool 1");
        poolId2 = resonate.createPool(address(USDC), address(rari2), 7e16, 0, 86400, 1000e6, "Pool 1");
        
        vm.label(address(vault1), "adapter1");
        vm.label(address(rari1), "vault1");
        vm.label(address(resonate), "resonate");
    }

    // Passes 10,000 run fuzz with no reverts
    function testClaim_18_decimal(uint appreciation) public {
        vm.assume(appreciation < 1e42 && appreciation > 1);
        uint p1 = fnftHandler.getNextId();
        uint i1 = p1 + 1;

        //  Alice submits 1 packet as a consumer
        //  1000e6 DAI -> queue 
        //
        startHoax(alice, alice);
        DAI.approve(address(resonate), type(uint).max);
        resonate.submitConsumer(poolId1, 1000e18, true);
        vm.stopPrank();

        //  Bob submits 1 packet as a producer
        //  1000 packet size * 7e16 / 1e18 = 70 DAI
        startHoax(bob, bob);
        DAI.approve(address(resonate), type(uint).max);
        resonate.submitProducer(poolId1, 70e18, false);
        vm.stopPrank();

        // They get matched, and Alice's capital goes to the RariVault
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 DAI
        // 70 DAI
        // At this is point, Bob owns 100% of the vault shares    

        // The RariVault appreciates
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 + 250 DAI
        appreciateVaultBy(address(rari1), appreciation);

        // Bob claims the interest from his fnftId
        // Alice    Bob     Vault
        // PID=1    IID=2   1000 DAI
        //          250 DAI    
        uint bobBalance = DAI.balanceOf(bob);

        startHoax(bob, bob);
        resonate.claimInterest(i1, bob);
        uint interestFee = appreciation * fee / denom;
        // assertApproxEqAbs(DAI.balanceOf(address(bob)), bobBalance + appreciation - interestFee, 0);
    }
    // Passes 10,000 run fuzz with no reverts
    function testClaim_6_decimal(uint appreciation) public {
        vm.assume(appreciation < 1e42 && appreciation > 1);
        uint p1 = fnftHandler.getNextId();
        uint i1 = p1 + 1;

        //  Alice submits 1 packet as a consumer
        //  1000e6 USDC -> queue 
        //
        startHoax(alice, alice);
        USDC.approve(address(resonate), type(uint).max);
        resonate.submitConsumer(poolId2, 1000e6, true);
        vm.stopPrank();

        //  Bob submits 1 packet as a producer
        //  1000 packet size * 7e16 / 1e18 = 70 USDC
        startHoax(bob, bob);
        USDC.approve(address(resonate), type(uint).max);
        resonate.submitProducer(poolId2, 70e6, false);
        vm.stopPrank();

        // They get matched, and Alice's capital goes to the RariVault
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 USDC
        // 70 USDC
        // At this is point, Bob owns 100% of the vault shares    

        // The RariVault appreciates
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 + 250 USDC
        appreciateVaultBy(address(rari2), appreciation);

        // Bob claims the interest from his fnftId
        // Alice    Bob     Vault
        // PID=1    IID=2   1000 USDC
        //          250 USDC    
        uint bobBalance = USDC.balanceOf(bob);

        startHoax(bob, bob);
        resonate.claimInterest(i1, bob);
        uint interestFee = appreciation * fee / denom;
        // assertApproxEqAbs(USDC.balanceOf(address(bob)), bobBalance + appreciation - interestFee, 0);
    }

    function appreciateVaultBy(address vault, uint amount) public {
        startHoax(angel, angel);
        DAI.transfer(vault, amount);
        USDC.transfer(vault, amount);
        vm.stopPrank();
    }









}