pragma solidity >=0.8.0;

import "contracts/mocks/RariVault.sol";
import "contracts/interfaces/IERC4626.sol";
import "./ETHResonate.t.sol";

/*
    @Suite: SubmitConsumerBasic
    @Desc:  Test basic functionality of submitConsumer without cross asset pools.
            The idea is to identify the 4 possible initial states of the contract
            before submitting a consumer:
                1. No await producers
                2. Less awaiting producer packets than packets provided
                3. Exactly the same number of awaiting producer packets as packets provided
                4. More awaiting producer packets than packets provided
            
            Each test (except 1) creates a random intial queue state, then submits the appropriate
            number of consumer packets for whichever state its inspecting.

    @Test 1 The base case, where the producer queue is empty and consumer orders go
            straight to the consumer queue.
            @Invariants: queue positions, balances.
            @Runtime: ~6s

    @Test 2 Generates a random number of producers each submitting further random number of 
            producer packets, generating total producer packets, P. It then submits a random 
            number of consumer packets, C, where C < P.
            @Invariants: queue positions, balances.
            @Runtime: ~4 min

    @Test 3 Generates a random number of producers each submitting further random number of 
            producer packets, generating total producer packets, P. It then submits a random 
            number of consumer packets, C, where C > P.
            @Invariants: queue positions, balances.
            @Runtime: ~2 min

    @Test 4 Generates a random number of producers each submitting further random number of 
            producer packets, generating total producer packets, P. It then submits an equal
            number of consumer packets.
            @Invariants: queue positions, balances.
            @Runtime: ~6 min
    @Dev:   Each test can be changed to run only one cycle by commenting out the function parameter,
            and readding it as a local variable. RECOMMEND TO ONLY RUN ONE FUZZ TEST AT A TIME.
            forge test  --rpc-url https://eth-mainnet.alchemyapi.io/v2/zOVFUzSEld1v_MuTOqGPYkTYttwBUrmF 
                        --block-number 14939176 
                        --match-contract SubmitConsumerBasic 
                        --match-test testPerfectMatch  
                        -vvv
*/
contract SubmitConsumerBasic is ETHResonateTest {
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
    function testStraightToEnqueue(uint packets) public {
        // Set up
        vm.assume(packets > 0);
        vm.assume(packets <= 1000);
        deal(address(USDC), alice, 100000e6);
        (,,,,,,uint256 packetSize) = resonate.pools(poolId);
        uint256 amount = packets * packetSize;
        vm.assume(amount < 100000e6);
        uint256 deposit = adapter.previewDeposit(amount);

        // Assert initial conditions
        uint256 initVault = USDC.balanceOf(address(vault_address));
        assertEq(USDC.balanceOf(alice), 100000e6);
        assertEq(adapter.balanceOf(address(RH.getAddressForPool(poolId))), 0);

        // Assert initial queue positions are 0
        (uint64 pH, uint64 pT, uint64 cH, uint64 cT) = resonate.queueMarkers(poolId);
        assertEq(pH + pT + cH + cT, 4);

        // submit order
        hoax(alice, alice);
        resonate.submitConsumer(poolId, amount, true);

        // Assert end conditions
        assertEq(USDC.balanceOf(alice), 100000e6 - amount);
        assertEq(adapter.balanceOf(RH.getAddressForPool(poolId)), deposit);
        assertEq(USDC.balanceOf(address(vault_address)), initVault + amount);

        //Assert end queue positions are correct
        (pH, pT, cH, cT) = resonate.queueMarkers(poolId);
        assertEq(pH, 1);
        assertEq(pT, 1);
        assertEq(cH, 1);
        assertEq(cT, 2);
    }
    /*
        @test: Less Producer Packets in queue than incoming Consumer Packets
        @desc: Total # of producer packets < incoming consumer packets
        @env: USDC -> USDC pool
                    [x c_pkts filling all queued p_pkts, w/ leftover]
                                    |
                                    V
        
        P_Queue = { [~1-10000 packets]..~1-100 times..[~]             }        

        @results: C_Queue = { [some left] }, P_Queue = { empty }, Farm = { [1 huge principal lock]...[bunch of c_pkts]}
    */
    function testLessProducerPackets(uint numProducers) public {
        // Set up
        vm.assume(numProducers > 0);
        vm.assume(numProducers < 100);
        uint256 packetSize;
        uint256 prodPacketSize;
        {
            (,,,,uint128 rate,,uint256 _packetSize) = resonate.pools(poolId);
            packetSize = _packetSize;
            prodPacketSize = packetSize * rate / 1 ether;
        }
        uint256 initVault = USDC.balanceOf(address(vault_address));

        uint[] memory producer_queue = new uint[](numProducers);
        uint totalNumPackets = 0;
        for (uint i; i < numProducers; i++) {
            // my random number
            uint256 random;
            unchecked {
                random = (block.timestamp ** i) * (numProducers ** i);
            }
            address prod = address(uint160(random));
            vm.assume(prod != address(0));
            deal(address(USDC), prod, 10000000e6);
            hoax(prod, prod);
            USDC.approve(address(resonate), ~uint256(0));
            hoax(prod, prod);
            uint numPackets = random % 10000 + 1; // needs to be resticted between 1 and 10000
            resonate.submitProducer(poolId, numPackets * prodPacketSize, true);
            producer_queue[i] = numPackets;
            totalNumPackets += numPackets;
        }

        // Assert initial conditions
        assertEq(initVault + totalNumPackets * prodPacketSize, USDC.balanceOf(address(vault_address)));
        deal(address(USDC), alice, 10000000e6);
        assertEq(USDC.balanceOf(alice), 10000000e6);

        // Assert initial queue positions
        (uint64 pH, uint64 pT, uint64 cH, uint64 cT) = resonate.queueMarkers(poolId);
        assertEq(pH, 1);
        assertEq(pT, numProducers + 1);
        assertEq(cH, 1);
        assertEq(cT, 1);
        

        uint256 numConsumerPackets;
        unchecked {
            numConsumerPackets = block.timestamp ** numProducers;
        }
        // numConsumerPackets is number of packets [totalNumPackets, 2 * totalNumPackets]
        numConsumerPackets = (numConsumerPackets % totalNumPackets) + totalNumPackets + 1; // needs to be resticted between 1 and 10000000e6
        vm.assume(numConsumerPackets * packetSize < 10000000e6);
        
        // submit order
        hoax(alice, alice);
        uint amount = numConsumerPackets * packetSize;
        resonate.submitConsumer(poolId, amount, true);
        
        assertEq(USDC.balanceOf(alice), 10000000e6 - amount + (totalNumPackets * prodPacketSize));
        assertEq(USDC.balanceOf(address(vault_address)), initVault + amount);

        //Assert end queue positions are correct
        (pH, pT, cH, cT) = resonate.queueMarkers(poolId);
        assertEq(pH, numProducers + 1); // prod queue should be empty
        assertEq(pT, numProducers + 1);
        assertEq(cH, 1); // con queue should have one orde 
        assertEq(cT, 2);
    }
    /*
        @test: More Producer Packets in queue than Consumer Packets
        @desc: Total # of producer packets > consumer packets
        @env: USDC -> USDC pool
                    [x c_pkts filling some queued p_pkts]
                                    |
                                    V
        
        P_Queue = { [~1-10000 packets]...[~]... x ~1-100 times }

        @results: C_Queue = { empty }, P_Queue = { [some left]... }, Farm = { [1 huge principal lock]...[bunch of little p_pkts]}
    */
    function testMoreProducerPackets(uint numProducers) public {
        // Set up
        vm.assume(numProducers > 0);
        vm.assume(numProducers < 100);
        uint256 packetSize;
        uint256 prodPacketSize;
        {
            (,,,,uint128 rate,,uint256 _packetSize) = resonate.pools(poolId);
            packetSize = _packetSize;
            prodPacketSize = packetSize * rate / 1 ether;
        }
        uint256 initVault = USDC.balanceOf(address(vault_address));

        uint[] memory producer_queue = new uint[](numProducers);
        uint totalNumPackets = 0;
        for (uint i; i < numProducers; i++) {
            // my random number
            uint256 random;
            unchecked {
                random = (block.timestamp ** i) * (numProducers ** i);
            }
            address prod = address(uint160(random));
            vm.assume(prod != address(0));
            deal(address(USDC), prod, 10000000e6);
            hoax(prod, prod);
            USDC.approve(address(resonate), ~uint256(0));
            hoax(prod, prod);
            uint numPackets = random % 10000 + 1; // needs to be resticted between 1 and 10000
            resonate.submitProducer(poolId, numPackets * prodPacketSize, true);
            producer_queue[i] = numPackets;
            totalNumPackets += numPackets;
        }

        // Assert initial conditions
        assertEq(initVault + totalNumPackets * prodPacketSize, USDC.balanceOf(address(vault_address)));
        deal(address(USDC), alice, 10000000e6);
        assertEq(USDC.balanceOf(alice), 10000000e6);
        assertEq(adapter.balanceOf(address(RH)), 0);

        // Assert initial queue positions
        (uint64 pH, uint64 pT, uint64 cH, uint64 cT) = resonate.queueMarkers(poolId);
        assertEq(pH, 1);
        assertEq(pT, numProducers + 1);
        assertEq(cH, 1);
        assertEq(cT, 1);
        

        uint256 numConsumerPackets;
        unchecked {
            numConsumerPackets = block.timestamp ** numProducers;
        }
        // numConsumerPackets is number of packets [1, totalNumPackets - 1]
        numConsumerPackets = (numConsumerPackets % (totalNumPackets - 1)) + 1; // needs to be resticted between 1 and 10000000e6
        vm.assume(numConsumerPackets * packetSize < 10000000e6);
        
        // submit order
        hoax(alice, alice);
        uint amount = numConsumerPackets * packetSize;
        resonate.submitConsumer(poolId, amount, true);
        
        uint _packetsRemainingInPos = 0;
        uint _position = 0;
        
        {
            uint _amount = numConsumerPackets;
            for (uint i; i < numProducers; i++) {
                if (producer_queue[i] >= _amount) {
                    _position = i;
                    _packetsRemainingInPos = producer_queue[i] - _amount;
                    break;
                } 
                _amount -= producer_queue[i];
            }
        }
        // Assert end conditions
        // uint256 upfrontPayment = numConsumerPackets * prodPacketSize;
        assertEq(USDC.balanceOf(alice), 10000000e6 - amount + (numConsumerPackets * prodPacketSize));
        assertEq(USDC.balanceOf(address(vault_address)), initVault + amount + ((totalNumPackets - numConsumerPackets) * prodPacketSize));

        //Assert end queue positions are correct
        (pH, pT, cH, cT) = resonate.queueMarkers(poolId);
        assertEq(pT, numProducers + 1);
        assertEq(cH, 1);
        assertEq(cT, 1);

        if (_packetsRemainingInPos > 0) {
            assertEq(pH, _position + 1);
        } else {
            assertEq(pH, _position + 2);
        }
        
    }
    /*
        @test: Perfect Matching Consumer Add
        @desc: Total # of producer packets == consumer packets
        @env: USDC -> USDC pool
                    [x c_pkts filling all queued p_pkts]
                                    |
                                    V
        
        P_Queue = { [~1-10000 packets]...[~]... x ~1-100 times }

        @results: C_Queue = { empty }, P_Queue = { empty }, Farm = { [1 huge principal lock] }
    */
    function testPerfectMatch(uint numProducers) public {
        // Set up
        vm.assume(numProducers > 0);
        vm.assume(numProducers < 100);
        (,,,,uint128 rate,,uint256 packetSize) = resonate.pools(poolId);
        uint256 prodPacketSize = packetSize * rate / 1 ether;
        uint256 initVault = USDC.balanceOf(address(vault_address));
        /*
            For each producer, generate a random number by timestamp^i in an
            unchecked block so it wraps. Then get the random address, give it
            $1m USDC, get the random number of packets [1, 1000], then submit the order
            All this does is generate a random, known queue state.
        */
        uint totalNumPackets = 0;
        for (uint i; i < numProducers; i++) {
            // my random number
            uint256 random;
            unchecked {
                random = (block.timestamp ** i) * (numProducers ** i);
            }
            address prod = address(uint160(random));
            vm.assume(prod != address(0));
            deal(address(USDC), prod, 10000000e6);
            hoax(prod, prod);
            USDC.approve(address(resonate), ~uint256(0));
            hoax(prod, prod);
            uint numPackets = random % 10000 + 1; // needs to be resticted between 1 and 10000
            resonate.submitProducer(poolId, numPackets * prodPacketSize, true);
            totalNumPackets += numPackets;
        }

        // Assert initial conditions
        assertEq(initVault + totalNumPackets * prodPacketSize, USDC.balanceOf(address(vault_address)));
        deal(address(USDC), alice, 10000000e6);
        assertEq(USDC.balanceOf(alice), 10000000e6);

        // Assert initial queue positions
        (uint64 pH, uint64 pT, uint64 cH, uint64 cT) = resonate.queueMarkers(poolId);
        assertEq(pH, 1);
        assertEq(pT, numProducers + 1);
        assertEq(cH, 1);
        assertEq(cT, 1);

        uint256 amount = totalNumPackets * packetSize;
        vm.assume(amount < 10000000e6);

        // submit order
        hoax(alice, alice);
        resonate.submitConsumer(poolId, amount, true);

        // Assert end conditions
        uint256 upfrontPayment = totalNumPackets * prodPacketSize;
        assertEq(USDC.balanceOf(alice), 10000000e6 - amount + upfrontPayment);
        assertEq(USDC.balanceOf(address(vault_address)), initVault + amount);
        assertEq(adapter.balanceOf(address(RH.getAddressForPool(poolId))), 0);

        //Assert end queue positions are correct
        (pH, pT, cH, cT) = resonate.queueMarkers(poolId);
        assertEq(pH, numProducers + 1);
        assertEq(pT, numProducers + 1);
        assertEq(cH, 1);
        assertEq(cT, 1);
    }
}