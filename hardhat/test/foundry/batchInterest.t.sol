pragma solidity >= 0.8.0;

import "./ETHResonate.t.sol";
import "contracts/mocks/RariVault.sol";
import "contracts/lib/ERC20.sol";

contract BatchInterestTest is ETHResonateTest {
    bytes32 poolId1;
    uint buffer = 0;
    IERC4626 vault1;
    IERC4626 vault2;
    IERC4626 vault3;
    RariVault rari1;
    RariVault rari2;
    RariVault rari3;
    address alice = address(2e9); // random
    address bob = address(2e10); // 
    address angel = address(2e11);
    uint fee = 5;
    uint denom = 100;

    // Runs once at the state => before()
    constructor() ETHResonateTest() {
        hoax(alice, alice);
        USDC.approve(address(resonate), ~uint256(0));
        hoax(bob, bob);
        USDC.approve(address(resonate), type(uint).max);
        vm.label(alice, "alice");
        vm.label(bob, "bob");
        vm.label(angel, "angel");
        deal(address(USDC), alice, 1000000e6);
        deal(address(USDC), bob, 1000000e6);
        deal(address(USDC), angel, 1000000e6);
        
        rari1 = new RariVault(USDC);
        vault1 = IERC4626(address(rari1));
        
        rari2 = new RariVault(USDC);
        vault2 = IERC4626(address(rari2));

        rari3 = new RariVault(USDC);
        vault2 = IERC4626(address(rari3));

        resonate.modifyVaultAdapter(address(rari1), address(vault1));
        resonate.modifyVaultAdapter(address(rari2), address(vault2));
        resonate.modifyVaultAdapter(address(rari3), address(vault3));
            
        poolId1 = resonate.createPool(address(USDC), address(rari1), 7e16, 0, 86400, 1000e6, "Pool 1");
        
        vm.label(address(vault1), "adapter1");
        vm.label(address(rari1), "vault1");
        vm.label(address(resonate), "resonate");
    }

    uint[][] pools;
    uint[] fnftIds;
    // uint dust = 200 wei;
    // Passes 1000 run fuzz with no reverts
    function testBatchClaim_1id_1pool(uint appreciation) public {
        vm.assume(appreciation < 1000000e6 && appreciation > 1e3);
        uint p1 = fnftHandler.getNextId();
        uint i1 = p1 + 1;

        //  Alice submits 1 packet as a consumer
        //  1000e6 USDC -> queue 
        //
        startHoax(alice, alice);
        USDC.approve(address(resonate), type(uint).max);
        resonate.submitConsumer(poolId1, 1000e6, true);
        vm.stopPrank();

        //  Bob submits 1 packet as a producer
        //  1000 packet size * 7e16 / 1e18 = 70 USDC
        startHoax(bob, bob);
        USDC.approve(address(resonate), type(uint).max);
        resonate.submitProducer(poolId1, 70e6, false);
        vm.stopPrank();

        // They get matched, and Alice's capital goes to the RariVault
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 USDC
        // 70 USDC
        // At this is point, Bob owns 100% of the vault shares    

        // The RariVault appreciates
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 + 250 USDC
        appreciateVaultBy(address(rari1), appreciation);

        // Bob claims the interest from his fnftId
        // Alice    Bob     Vault
        // PID=1    IID=2   1000 USDC
        //          250 USDC    
        uint bobBalance = USDC.balanceOf(bob);
        fnftIds.push(i1);
        pools.push(fnftIds);

        startHoax(bob, bob);
        resonate.batchClaimInterest(pools, bob);
    }

    // 3 different pools, same rari vault
    // passes 250 runs
    function testBatchClaim_nIds_1pool(uint32 appreciation, uint8 n) public {
        vm.assume(appreciation > 1e3 && n > 0);
    
        for (uint i; i < n; i++) {
            //  Alice submits 1 packet as a consumer
            //  1000e6 USDC -> queue 
            //
            uint i_id = fnftHandler.getNextId() + 1;
            fnftIds.push(i_id);

            startHoax(alice, alice);
            resonate.submitConsumer(poolId1, 1000e6, true);
            vm.stopPrank();

            //  Bob submits 1 packet as a producer
            //  1000 packet size * 7e16 / 1e18 = 70 USDC
            startHoax(bob, bob);
            resonate.submitProducer(poolId1, 70e6, false);
            vm.stopPrank();
        }

        // They get matched, and Alice's capital goes to the RariVault
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 USDC
        // 70 USDC
        // At this is point, Bob owns 100% of the vault shares    

        // The RariVault appreciates
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 + 250 USDC
        appreciateVaultBy(address(rari1), appreciation);

        // Bob claims the interest from his fnftId
        // Alice    Bob     Vault
        // PID=1    IID=2   1000 USDC
        //          250 USDC    
        uint bobBalance = USDC.balanceOf(bob);

        startHoax(bob, bob);
        pools.push(fnftIds);
        resonate.batchClaimInterest(pools, bob);
        uint interestFee = appreciation * fee / denom;
        assertApproxEqAbs(USDC.balanceOf(address(bob)), bobBalance + appreciation - interestFee, 1e9 wei);
    }
    // p
    function testBatchClaim_nIds_nPools(uint32 appreciation, uint8 n, uint8 m) public {
        vm.assume(n > 0 && n < 10 && appreciation > 1e3 && m < 10 && m > 0);

        for(uint j; j < m; j++) {
            RariVault rari = new RariVault(USDC);
            IERC4626 vault = IERC4626(address(rari1));

            resonate.modifyVaultAdapter(address(rari), address(vault));

            bytes32 poolId = resonate.createPool(address(USDC), address(rari), 7e16, 0, 86400, 1000e6, "Pool 1");
        
            for (uint i; i < n; i++) {
                //  Alice submits 1 packet as a consumer
                //  1000e6 USDC -> queue 
                //
                uint i_id = fnftHandler.getNextId() + 1;
                fnftIds.push(i_id);

                startHoax(alice, alice);
                resonate.submitConsumer(poolId, 1000e6, true);
                vm.stopPrank();

                //  Bob submits 1 packet as a producer
                //  1000 packet size * 7e16 / 1e18 = 70 USDC
                startHoax(bob, bob);
                resonate.submitProducer(poolId, 70e6, false);
                vm.stopPrank();
            }
            pools.push(fnftIds);
            while (fnftIds.length > 0) fnftIds.pop(); 
        }

        // They get matched, and Alice's capital goes to the RariVault
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 USDC
        // 70 USDC
        // At this is point, Bob owns 100% of the vault shares    

        // The RariVault appreciates
        // Alice    BOB     Vault
        // PID=1    IID=2   1000 + 250 USDC
        appreciateVaultBy(address(rari1), appreciation);

        // Bob claims the interest from his fnftId
        // Alice    Bob     Vault
        // PID=1    IID=2   1000 USDC
        //          250 USDC    
        uint bobBalance = USDC.balanceOf(bob);

        startHoax(bob, bob);
        resonate.batchClaimInterest(pools, bob);
        uint interestFee = appreciation * fee / denom;
        assertApproxEqAbs(USDC.balanceOf(address(bob)), bobBalance + appreciation - interestFee, 1e9 wei);
    }


    function appreciateVaultBy(address vault, uint amount) public {
        startHoax(angel, angel);
        USDC.transfer(vault, amount);
        vm.stopPrank();
    }









}