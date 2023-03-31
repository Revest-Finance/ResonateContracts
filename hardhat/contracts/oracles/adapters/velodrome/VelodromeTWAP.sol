// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/IPairFactory.sol";
import "../../interfaces/IPair.sol";

import "../../../interfaces/IERC20Detailed.sol";

import "../ProviderAwareOracle.sol";


contract VelodromeTWAP is ProviderAwareOracle {

    struct TwapConfig {
        address pairAddress; 
        uint8 decimals; 
    }

    /// The commonly-used asset tokens on this TWAP are paired with
    /// May be token0 or token1 depending on sort order
    address public immutable TOKEN;

    /// Address for the WETH token on this chain, needed for conformity
    address public immutable WETH;

    /// Stores # of decimals for TOKEN
    uint8 public immutable TOKEN_DECIMALS;

    // Maps non-base token to pair address
    mapping(address => TwapConfig) public twaps;

    address public velodrome;

    /**
     * @dev sets up the Price Oracle
     *
     * @param _inToken the pool token which will be a common component for all govi tokens on this TWAP
     * @param _weth the WETH address for the given chain
     * @param _factory the address of the uniswap factory (NOT THE ROUTER) to retrieve pairs from
     */
    constructor(address _provider, address _inToken, address _weth, address _factory) ProviderAwareOracle(_provider) {
        require(_inToken != address(0) && _weth != address(0), "ER003");
        TOKEN = _inToken;
        WETH = _weth;
        TOKEN_DECIMALS = IERC20Detailed(TOKEN).decimals();
        velodrome = _factory;
    }

    /****** OPERATIONAL METHODS ******/

    /**
     * @dev returns the TWAP for the provided pair as of the last update
     */
    function getSafePrice(address asset) external view returns (uint256 amountOut) {
        amountOut = _fetchPrice(asset);
    }

    /**
     * @dev returns the current "unsafe" price that can be easily manipulated
     */
    function getCurrentPrice(address asset) external view returns (uint256 amountOut) {
        amountOut = _fetchPrice(asset);
    }

    /**
     * @dev updates the TWAP (if enough time has lapsed) and returns the current safe price
     */
    function updateSafePrice(address asset) external view returns (uint256 amountOut) {
        amountOut = _fetchPrice(asset);
    }

    /****** INTERNAL METHODS ******/

    function _fetchPrice(address asset) private view returns (uint amountOut) {
        TwapConfig memory twap = twaps[asset];
        IPair pair = IPair(twap.pairAddress);

        uint8 decimals = twap.decimals; // 18

        if (decimals > TOKEN_DECIMALS) {
            uint _tokenMissingDecimals = decimals - TOKEN_DECIMALS; // 12
            amountOut = pair.current(asset, PRECISION) * (10**_tokenMissingDecimals);
        } else {
            uint _tokenMissingDecimals = TOKEN_DECIMALS - decimals;
            amountOut = pair.current(asset, PRECISION) / (10**_tokenMissingDecimals);
        }   

        if(TOKEN != WETH) {
            amountOut = amountOut * provider.getSafePrice(TOKEN) / PRECISION;
        }
    }

    /**
    * @dev Setup the twap for a new token to pair it to
    * @param asset token to initialize a twap for that is paired with TOKEN (WETH) 
    */
    function initializeOracle(address asset, bool isStable) external onlyOwner {
        require(asset != address(0), 'ER003');
        require(twaps[asset].pairAddress == address(0), 'ER038');

        // Resolve pair sorting order
        address token1 = asset < TOKEN ? TOKEN : asset;
        bool isToken0 = token1 != asset;
        address token0 = isToken0 ? asset : TOKEN;

        address pair = IPairFactory(velodrome).getPair(token0, token1, isStable);
        require(pair != address(0), 'ER003');
        TwapConfig memory twap = TwapConfig(pair, IERC20Detailed(asset).decimals());
        twaps[asset] = twap;
    }
}
