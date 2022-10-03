pragma solidity >=0.8.0;

import "contracts/mocks/RariVault.sol";
import "contracts/interfaces/IERC4626.sol";
import "./ETHResonate.t.sol";


contract breakGlass is ETHResonateTest {
    bytes32 poolId;

    IERC4626 adapter;
    address vault_address;
    address alice = address(2e9); // random
    address bob = address(2e10); // random
    
    // Runs once at the state => before()
    constructor() ETHResonateTest() {
        hoax(alice, alice);
        USDC.approve(address(resonate), ~uint256(0));
        vm.label(alice, "alice");
        vm.label(bob, "bob");
        vm.label(address(resonate), "resonate");
    }

    // Runs before each test => beforeEach()
    function setUp() public {
        RariVault vault = new RariVault(USDC);
        vault_address = address(vault);
        adapter = IERC4626(address(vault));
        resonate.modifyVaultAdapter(address(vault), address(adapter));
        poolId = resonate.createPool(address(USDC), address(vault), 7e18, 0, 86400, 1000, "Pool 1");
        vm.label(address(adapter), "adapter");
        vm.label(vault_address, "vault");
    }
    /*
        @test: StraightToQueue
        @env: USDC -> USDC pool
                    [~1-1000 packets]
                            |
                            V
        C_Queue = {                   }
        P_Queue = { }

        @results: C_Queue = { [order] }, P_Queue = { empty }, Farm = { order }
    */
    function testFailBreakGlass() public {
        hoax(RH.SANDWICH_BOT_ADDRESS());

        RH.breakGlass();
        (,,,,,,uint256 packetSize) = resonate.pools(poolId);
        uint256 amount = packetSize;
        // submit order

        deal(address(USDC), alice, 100000e6);
        hoax(alice, alice);
        resonate.submitConsumer(poolId, amount, true);
    }

    function testFailBreakGlasswithDelegation() public {
        hoax(RH.SANDWICH_BOT_ADDRESS());

        RH.grantRole("BREAKER", alice);
        hoax(alice);
        RH.breakGlass();

        (,,,,,,uint256 packetSize) = resonate.pools(poolId);
        uint256 amount = packetSize;

        deal(address(USDC), alice, 100000e6);
        hoax(alice, alice);
        resonate.submitConsumer(poolId, amount, true);
    }

    function testRepairGlass() public {

        (,,,,uint128 rate,,uint256 packetSize) = resonate.pools(poolId);
        uint256 amount = packetSize;
        deal(address(USDC), alice, 100000e6);


        hoax(RH.SANDWICH_BOT_ADDRESS());
        RH.breakGlass();

        vm.expectRevert('ER027');

        hoax(alice, alice);
        resonate.submitConsumer(poolId, amount, true);

        hoax(RH.SANDWICH_BOT_ADDRESS());
        RH.repairGlass();


        hoax(alice, alice);
        console2.log("Submitting Consumer with broken glass...");
        resonate.submitConsumer(poolId, amount, true);
    }

}