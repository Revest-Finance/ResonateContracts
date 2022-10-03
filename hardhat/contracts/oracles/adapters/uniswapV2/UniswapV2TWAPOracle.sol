// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../../lib/FixedPoint.sol";
import "../../../lib/uniswap/IUniswapV2Factory.sol";
import "../../../interfaces/IERC20Detailed.sol";

import "../ProviderAwareOracle.sol";

/**
See https://github.com/Uniswap/v2-periphery/blob/master/contracts/examples/ExampleOracleSimple.sol
for the basis for the below contract. ExampleOracleSimple contract has been extended to support tracking multiple
pairs within the same contract.
*/

contract UniswapV2TWAPOracle is ProviderAwareOracle {
    using FixedPoint for *;

    struct TwapConfig {
        uint lastUpdateCumulativePrice;
        uint32 timestampLatest; // 4 bytes
        FixedPoint.uq112x112 lastUpdateTwapPrice; // 28 bytes
        // Should conform to IUniswapV2Pair interface
        address pairAddress; // 20 bytes
        bool isToken0; // 1 byte
        uint8 decimals; // 1 byte
    }

    /// The commonly-used asset tokens on this TWAP are paired with
    /// May be token0 or token1 depending on sort order
    address public immutable TOKEN;

    address public immutable WETH;

    // Maps token0 to it's latest readings
    mapping(address => TwapConfig) public twaps;

    // 5 minutes
    uint32 public constant MIN_UPDATE_DEFAULT = 5 minutes;
    uint32 public constant MAX_UPDATE = 60 minutes;

    uint32 public immutable MIN_UPDATE;

    address public uniswap;

    /**
     * @dev sets up the Price Oracle
     *
     * @param _inToken the pool token which will be a common component for all govi tokens on this TWAP
     * @param _weth the WETH address for the given chain
     * @param _minimumUpdateInterval how often to permit updates to the TWAP (seconds)
     *                               If set to 0, will use the default of 5 minutes
     * @param _factory the address of the uniswap factory (NOT THE ROUTER) to retrieve pairs from
     */
    constructor(address _provider, address _inToken, address _weth, uint32 _minimumUpdateInterval, address _factory) ProviderAwareOracle(_provider) {
        require(_inToken != address(0) && _weth != address(0), "ER003");
        MIN_UPDATE = _minimumUpdateInterval == 0 ? MIN_UPDATE_DEFAULT : _minimumUpdateInterval;
        TOKEN = _inToken;
        WETH = _weth;
        uniswap = _factory;
    }

    /****** OPERATIONAL METHODS ******/

    /**
     * @dev returns the TWAP for the provided pair as of the last update
     */
    function getSafePrice(address asset) public view returns (uint256 amountOut) {
        require(block.timestamp - twaps[asset].timestampLatest <= MAX_UPDATE, 'ER037');
        TwapConfig memory twap = twaps[asset];
        amountOut = _convertPrice(asset, twap.lastUpdateTwapPrice);
    }

    /**
     * @dev returns the current "unsafe" price that can be easily manipulated
     */
    function getCurrentPrice(address asset) public view returns (uint256 amountOut) {
        TwapConfig memory twap = twaps[asset];
        IUniswapV2Pair pair = IUniswapV2Pair(twap.pairAddress);

        uint8 decimals;

        try IERC20Detailed(asset).decimals() returns (uint8 numDecimals) {
            decimals = numDecimals;
        } catch {
            decimals = 18;
        }

        (uint reserve0, uint reserve1, ) = pair.getReserves();
      
        uint8 _token1MissingDecimals;
        if (twap.isToken0) {
            if (decimals > IERC20Detailed(TOKEN).decimals()) {
                _token1MissingDecimals = decimals - (IERC20Detailed(TOKEN).decimals());
                amountOut = (reserve1 * (10**_token1MissingDecimals) * PRECISION) / reserve0;
            } else {

                _token1MissingDecimals = (IERC20Detailed(TOKEN).decimals()) - decimals;
                amountOut = (reserve1 * PRECISION) / (reserve0 * (10**_token1MissingDecimals));
            }    
        } else {
            if (decimals > IERC20Detailed(TOKEN).decimals()) {
                _token1MissingDecimals = decimals - (IERC20Detailed(TOKEN).decimals());
                amountOut = (reserve0 * (10**_token1MissingDecimals) * PRECISION) / reserve1;

            } else {
                _token1MissingDecimals = (IERC20Detailed(TOKEN).decimals()) - decimals;
                        // amountOut = (reserve0 * (10**_token1MissingDecimals) * PRECISION) / reserve1;
                amountOut = (reserve0 * PRECISION) / (reserve1 * (10**_token1MissingDecimals));

            }    
        }
        
        if(TOKEN != WETH) {
            amountOut = amountOut * provider.getSafePrice(TOKEN) / PRECISION;
        }
    }

    /**
     * @dev updates the TWAP (if enough time has lapsed) and returns the current safe price
     */
    function updateSafePrice(address asset) public returns (uint256 amountOut) {
        // This method will fail if the TWAP has not been initialized on this contract
        // This action must be performed externally
        (uint cumulativeLast, uint lastCumPrice, uint32 lastTimeSync, uint32 lastTimeUpdate) = _fetchParameters(asset);
        TwapConfig storage twap = twaps[asset];
        FixedPoint.uq112x112 memory lastAverage;
        lastAverage = FixedPoint.uq112x112(uint224((cumulativeLast - lastCumPrice) / (lastTimeSync - lastTimeUpdate)));
        twap.lastUpdateTwapPrice = lastAverage;
        twap.lastUpdateCumulativePrice = cumulativeLast;
        twap.timestampLatest = lastTimeSync;

        // Call sub method HERE to same thing getSafePrice uses to avoid extra SLOAD
        amountOut = _convertPrice(asset, lastAverage);
    }

    /****** INTERNAL METHODS ******/

    function _convertPrice(address asset, FixedPoint.uq112x112 memory lastUpdatePrice) private view returns (uint amountOut) {
        uint nativeDecimals = 10**IERC20Metadata(asset).decimals();
        
        // calculate the value based upon the average cumulative prices
        // over the time period (TWAP)
        if (TOKEN == WETH) {
            // No need to convert the asset
            amountOut = lastUpdatePrice.mul(nativeDecimals).decode144();
        } else {
            // Need to convert the feed to be in terms of ETH
            uint8 tokenDecimals = IERC20Metadata(TOKEN).decimals();
            uint conversion = provider.getSafePrice(TOKEN);
            // amountOut = FixedPoint.uq112x112(uint112(lastUpdatePrice.mul(uint144(10**tokenDecimals)).decode144())).div(nativeDecimals).decode();
            amountOut = lastUpdatePrice.mul(10**tokenDecimals).decode144() * conversion / nativeDecimals;
        }
    }

    function _fetchParameters(
        address asset
    ) private view returns (
        uint cumulativeLast, 
        uint lastCumPrice, 
        uint32 lastTimeSync, 
        uint32 lastTimeUpdate
    ) {    
        TwapConfig memory twap = twaps[asset];
        require(twap.decimals > 0, 'ER035');
        // Enforce passage of a safe amount of time
        lastTimeUpdate = twap.timestampLatest;
        require(block.timestamp > lastTimeUpdate + MIN_UPDATE, 'ER036');
        IUniswapV2Pair pair = IUniswapV2Pair(twap.pairAddress);
        cumulativeLast = twap.isToken0 ? pair.price0CumulativeLast() : pair.price1CumulativeLast();
        lastCumPrice = twap.lastUpdateCumulativePrice;
        (, , lastTimeSync) = pair.getReserves();
    }

    /**
    * @dev Setup the twap for a new token to pair it to
    * @param asset token to initialize a twap for that is paired with TOKEN (WETH) 
    */
    function initializeOracle(address asset) external {
        require(asset != address(0), 'ER003');
        require(twaps[asset].decimals == 0, 'ER038');

        // Resolve Uniswap pair sorting order
        address token1 = asset < TOKEN ? TOKEN : asset;
        bool isToken0 = token1 != asset;
        address token0 = isToken0 ? asset : TOKEN;

        address pair = IUniswapV2Factory(uniswap).getPair(token0, token1);
        require(pair != address(0), 'ER003');
        IUniswapV2Pair uni_pair = IUniswapV2Pair(pair);        
        TwapConfig memory twap = TwapConfig(
            isToken0 ? uni_pair.price0CumulativeLast() : uni_pair.price1CumulativeLast(), 
            0,
            FixedPoint.uq112x112(0),
            pair, 
            isToken0, 
            IERC20Detailed(asset).decimals()
        );
        (, , twap.timestampLatest) = uni_pair.getReserves();
        twaps[asset] = twap;
    }
}
