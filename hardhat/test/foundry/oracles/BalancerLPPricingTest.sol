pragma solidity >0.8.0; 

import "forge-std/Test.sol";
import "forge-std/console.sol";

import "contracts/oracles/interfaces/IBPoolV2.sol";
import "contracts/oracles/interfaces/IBVaultV2.sol";
import "contracts/oracles/adapters/balancer/BalancerV2WeightedPoolPriceOracle.sol";
import "contracts/oracles/PriceProvider.sol";
import "contracts/oracles/adapters/SimpleOracle.sol";

contract BalancerLPPricingTest is Test {

    BalancerV2WeightedPoolPriceOracle public oracle;
    BalancerV2WeightedPoolPriceOracle public oracle2;

    PriceProvider public priceProvider;
    SimpleOracle public simpleOracle;
    address public immutable vault = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public immutable WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public immutable WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address public immutable BADGER = 0x3472A5A71965499acd81997a54BBA8D852C6E53d;

    bytes32 public immutable poolId = 0xc4451498f950b8b3abd9a815cf221a8e647913880001000000000000000001ea;
    address public immutable pooln2Addr = 0xb460DAa847c45f1C4a41cb05BFB3b51c92e41B36;

    address public immutable USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public immutable usdtWETHPool = 0x3e5FA9518eA95c3E533EB377C001702A9AaCAA32;
    bytes32 public immutable secondPoolID = 0x3e5fa9518ea95c3e533eb377c001702a9aacaa32000200000000000000000052;

    constructor() {
        priceProvider = new PriceProvider();
        simpleOracle = new SimpleOracle(address(priceProvider));

        priceProvider.setTokenOracle(WETH, address(simpleOracle));
        priceProvider.setTokenOracle(USDT, address(simpleOracle));
        priceProvider.setTokenOracle(WBTC, address(simpleOracle));
        priceProvider.setTokenOracle(BADGER, address(simpleOracle));

        oracle = new BalancerV2WeightedPoolPriceOracle(address(priceProvider), vault, WETH);
        oracle2 = new BalancerV2WeightedPoolPriceOracle(address(priceProvider), vault, WETH);

        simpleOracle.updatePrice(WETH, 1000000000000000000); //1 WETH = 1 ETH
        simpleOracle.updatePrice(WBTC, 12779708000000000000);// 1 BTC = 13.36 ETH
        simpleOracle.updatePrice(BADGER, 2558000000000000); // 1 BADGER = 0.002558 ETH
        simpleOracle.updatePrice(USDT, 654000000000000); //1 USDT = 0.000654 ETH

        vm.label(BADGER, "Badger");
        vm.label(WBTC, "WBTC");
        vm.label(WETH, "WETH");
        vm.label(USDT, "USDT");
        vm.label(vault, "vault");
        vm.label(address(simpleOracle), "simpleOracle");
        vm.label(address(priceProvider), "priceProvider");
        vm.label(address(pooln2Addr), "PoolAddr");

    }

    function testGetLPPrice() public {
        uint256 LPPrice = oracle.getSafePrice(pooln2Addr);
        console.log("Price: %s", LPPrice);
        assert(LPPrice > 0);

        uint256 secondLPPrice = oracle.getSafePrice(usdtWETHPool);
        console.log("Second Price: %s", secondLPPrice);
        assert(secondLPPrice > 0);

    }
    
}
