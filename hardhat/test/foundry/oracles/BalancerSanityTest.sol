pragma solidity >0.8.0; 

import "forge-std/Test.sol";
import "forge-std/console.sol";

import "contracts/oracles/interfaces/IBPoolV2.sol";
import "contracts/oracles/interfaces/IBVaultV2.sol";
import "contracts/oracles/adapters/balancer/BalancerV2WeightedPoolPriceOracle.sol";
import "contracts/oracles/PriceProvider.sol";
import "contracts/oracles/adapters/SimpleOracle.sol";

contract BalancerSanityTest is Test {

    constructor() {

    }

    function testGetLPPrice() public {
        bytes32 poolId = bytes32(0xc45d42f801105e861e86658648e3678ad7aa70f900010000000000000000011e);
        IBVaultV2 vault = IBVaultV2(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
        vault.getPoolTokens(poolId);

    }
    
}
