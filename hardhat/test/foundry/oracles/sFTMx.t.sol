pragma solidity >0.8.0; 

import "forge-std/Test.sol";
import "contracts/interfaces/IPriceProvider.sol";
import "contracts/oracles/adapters/sFTMxOracle.sol";

contract sFTMxTest is Test {
    PriceProvider priceProvider = PriceProvider(0x3415E3A79189f9440159E3163518075560670F5E);
    
    sFTMxOracle _sFTMxOracle;

    address public constant WETH = 0x74b23882a30290451A17c44f4F05243b6b58C76d;
    address public constant WFTM = 0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83;
    address public constant sFTMx = 0xd7028092c830b5C8FcE061Af2E593413EbbC1fc1;
    address public constant sFTMxStaking = 0xB458BfC855ab504a8a327720FcEF98886065529b;

    constructor() {
        vm.label(address(priceProvider), "PriceProvider");
        // Leaving the base feed as 0 makes this a Token/WETH oracles
        
        _sFTMxOracle = new sFTMxOracle(address(priceProvider), WFTM, sFTMxStaking);
        hoax(0x9EB52C04e420E40846f73D09bD47Ab5e25821445, 0x9EB52C04e420E40846f73D09bD47Ab5e25821445);
        priceProvider.setTokenOracle(sFTMx, address(_sFTMxOracle));
    }
    function test_sFTMx() public {
        address alice = address(15);
        hoax(alice, alice);
        priceProvider.getCurrentPrice(sFTMx);
        hoax(alice, alice);
        uint price = priceProvider.getSafePrice(sFTMx);

        hoax(alice, alice);
        uint wftm_price = priceProvider.getSafePrice(WFTM);
    }
}