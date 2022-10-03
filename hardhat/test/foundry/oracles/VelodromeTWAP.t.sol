pragma solidity >0.8.0; 

import "forge-std/Test.sol";
import "forge-std/console.sol";

import "contracts/oracles/adapters/velodrome/VelodromeTWAP.sol";

contract VelodromeTWAPTest is Test {
    VelodromeTWAP twap;
    constructor() {
        twap = new VelodromeTWAP(
            0x0f89ba3f140ea9370ab05d434b8e32fdf41a6093,
            0x7f5c764cbc14f9669b88837ca1490cca17c31607,
            
        )
    }   

    function testGetLPPrice() public {
        bytes32 poolId = bytes32(0xc45d42f801105e861e86658648e3678ad7aa70f900010000000000000000011e);
        IBVaultV2 vault = IBVaultV2(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
        vault.getPoolTokens(poolId);

    }
    
}
