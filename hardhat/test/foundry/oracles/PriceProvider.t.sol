pragma solidity >0.8.0; 

import "forge-std/Test.sol";
import "contracts/interfaces/IPriceProvider.sol";
import "contracts/oracles/adapters/uniswapV2/UniswapV2LPPriceOracle.sol";
import "contracts/oracles/PriceProvider.sol";
import "contracts/oracles/adapters/chainlink/ChainlinkPriceOracle.sol";

contract PriceProviderTest is Test {
    PriceProvider priceProvider;   
    ChainlinkPriceOracle ChainlinkOracle;
    UniswapV2LPPriceOracle uniV2LPOracle;

    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant FRAX = 0x853d955aCEf822Db058eb8505911ED77F175b99e;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    address public constant chainlink_DAI_ETH = 0x773616E4d11A78F511299002da57A0a94577F1f4;
    address public constant chainlink_FRAX_ETH = 0x14d04Fff8D21bd62987a5cE9ce543d2F1edF5D3E;
    address public constant chainlink_USDC_ETH = 0x986b5E1e1755e3C2440e960477f25201B0a8bbD4;
    address public constant chainlink_USDT_ETH = 0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46;
    address public constant chainlink_ETH_USD = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    
    address public constant uniV2_ETH_USDC = 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc;

    constructor() {
        priceProvider = new PriceProvider();
        vm.label(address(priceProvider), "PriceProvider");
        // Leaving the base feed as 0 makes this a Token/WETH oracles
        ChainlinkOracle = new ChainlinkPriceOracle(address(0), address(priceProvider));
        vm.label(address(ChainlinkOracle), "ChainlinkOracle");
        ChainlinkOracle.setPriceFeed(DAI, chainlink_DAI_ETH);
        ChainlinkOracle.setPriceFeed(FRAX, chainlink_FRAX_ETH);
        ChainlinkOracle.setPriceFeed(USDC, chainlink_USDC_ETH);
        ChainlinkOracle.setPriceFeed(USDT, chainlink_USDT_ETH);
        
        uniV2LPOracle = new UniswapV2LPPriceOracle(address(priceProvider));
        vm.label(address(uniV2LPOracle), "UNI V2 LP Oracle");
        
        priceProvider.setTokenOracle(DAI, address(ChainlinkOracle));
        priceProvider.setTokenOracle(FRAX, address(ChainlinkOracle));
        priceProvider.setTokenOracle(USDC, address(ChainlinkOracle));
        priceProvider.setTokenOracle(USDT, address(ChainlinkOracle));

        vm.label(chainlink_DAI_ETH, "DAI/ETH feed");
        vm.label(chainlink_FRAX_ETH, "FRAX/ETH feed");
        vm.label(chainlink_USDC_ETH, "USDC/ETH feed");
        vm.label(chainlink_USDT_ETH, "USDT/ETH feed");
    }

    function test_stables() public {
        console2.log(block.timestamp);
        // @returns ans = ~1700.59e6
        (,int ans,,,)= AggregatorV3Interface(chainlink_ETH_USD).latestRoundData();
        
        // convert to uint = ~1700.59e16
        uint eth_usd = uint(ans) / 1e6 * 1e18 / 1e2; // 1700.59e16
        
        // equals $1 / eth_usd in 18 dec precision, or what a stablecoin should equal
        uint stable_target = 1e36 / eth_usd;

        // Tests to make sure the chainlink oracle router is working
        // 18 dec stables
        uint cl_dai_eth = ChainlinkOracle.getSafePrice(DAI);
        assertApproxEqAbs(cl_dai_eth, stable_target, 1e13); // $0.02 cent allowance
    
        uint cl_frax_eth = ChainlinkOracle.getSafePrice(FRAX);
        assertApproxEqAbs(cl_frax_eth, stable_target, 1e13); 
    
        // 6 dec stables
        uint cl_usdc_eth = ChainlinkOracle.getSafePrice(USDC);
        assertApproxEqAbs(cl_usdc_eth, stable_target, 1e13); 
    
        uint cl_usdt_eth = ChainlinkOracle.getSafePrice(USDT);
        assertApproxEqAbs(cl_usdt_eth, stable_target, 1e13);

        // 18 dec stables
        uint pp_dai_eth = priceProvider.getSafePrice(DAI);
        assertEq(pp_dai_eth, cl_dai_eth); // $0.02 cent allowance
    
        uint pp_frax_eth = priceProvider.getSafePrice(FRAX);
        assertEq(pp_frax_eth, cl_frax_eth); 
    
        // 6 dec stables
        uint pp_usdc_eth = priceProvider.getSafePrice(USDC);
        assertEq(pp_usdc_eth, cl_usdc_eth); 
    
        uint pp_usdt_eth = priceProvider.getSafePrice(USDT);
        assertEq(pp_usdt_eth, cl_usdt_eth); 
    
    }

    function test_uni_lps() public {
        uint res = uniV2LPOracle.getSafePrice(uniV2_ETH_USDC);
        console2.log(res);
    }
}