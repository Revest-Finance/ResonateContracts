// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@prb/math/contracts/PRBMathSD59x18.sol";

import "../ProviderAwareOracle.sol";
import "../../interfaces/IBPoolV2.sol";
import "../../interfaces/IBVaultV2.sol";

contract BalancerV2WeightedPoolPriceOracle is ProviderAwareOracle {

    using PRBMathSD59x18 for *;

    address public immutable WETH;

    IBVaultV2 public vault;
    uint256 public ratioDiffLimitNumerator;
    uint256 public ratioDiffLimitDenominator;

    event SetRatioDiffLimit(
        uint256 ratioDiffLimitNumerator,
        uint256 ratioDiffLimitDenominator
    );

    /**
     * @dev sets up the Price Oracle
     * @param _provider price provider
     * @param _vault balancer vault address
     */
    constructor(
        address _provider,
        address _vault,
        address _weth
    ) ProviderAwareOracle(_provider)  {
        require(_vault != address(0), "vault cannot be null address");
        vault = IBVaultV2(_vault);
        WETH = _weth;
    }

    /**
     * @dev set ratio difference limit
     */
    function setRatioDiffLimit(
        uint256 _ratioDiffLimitNumerator,
        uint256 _ratioDiffLimitDenominator
    ) external onlyOwner {
        require(
            _ratioDiffLimitNumerator <= _ratioDiffLimitDenominator,
            "INVALID RATIO DIFF LIMIT"
        );

        ratioDiffLimitNumerator = _ratioDiffLimitNumerator;
        ratioDiffLimitDenominator = _ratioDiffLimitDenominator;

        emit SetRatioDiffLimit(_ratioDiffLimitNumerator, _ratioDiffLimitDenominator);
    }

    /****** OPERATIONAL METHODS ******/

    /**
     * @dev returns the TWAP for the provided pair as of the last update
     */
    function getSafePrice(address _bpt) public view returns (uint256) {
        return _getLPPrice(_bpt, true);
    }

    /**
     * @dev returns the current "unsafe" price that can be easily manipulated
     */
    function getCurrentPrice(address _bpt) external view returns (uint256) {
        return _getLPPrice(_bpt, false);
    }

    /**
     * @dev updates the TWAP (if enough time has lapsed) and returns the current safe price
     */
    function updateSafePrice(address _bpt) external returns (uint256) {
        return getSafePrice(_bpt);
    }

    // internal functions

    function _getTokenSafePrice(address token) internal view returns (uint256 price) {       
        if (token != WETH) {
            price = provider.getSafePrice(token);
        } else {
            price = PRECISION;
        }
    }

    function _getTokenCurrentPrice(address token) internal view returns (uint256 price) {
        if (token != WETH) {
            price = provider.getCurrentPrice(token);
        } else {
            price = PRECISION;
        }
    }

    function _getLPPrice(address _bpt, bool isSafePrice)
        internal
        view
        returns (uint256 price)
    {
        bytes32 poolId = IBPoolV2(_bpt).getPoolId();
        uint256[] memory weights = IBPoolV2(_bpt).getNormalizedWeights();
        int256 totalSupply = int256(IBPoolV2(_bpt).totalSupply());
        (IERC20[] memory tokens, uint256[] memory balances, ) = vault.getPoolTokens(
            poolId
        );

        // console.logInt(totalSupply);

        // int256 invariant = PRBMathSD59x18.toInt(1e18);
        int256 totalPi = PRBMathSD59x18.fromInt(1e18);

        uint256 totalFTM;
        uint256[] memory prices = new uint256[](tokens.length);
        // update balances in 18 decimals
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] =
                (balances[i] * (10**18)) /
                (10**ERC20(address(tokens[i])).decimals());
            prices[i] = isSafePrice
                ? _getTokenSafePrice(address(tokens[i]))
                : _getTokenCurrentPrice(address(tokens[i]));

            int256 val = int256(prices[i]).div(int256(weights[i]));
            int256 indivPi = val.pow(int256(weights[i]));

            totalPi = totalPi.mul(indivPi);
           
        }

        int256 invariant = int256(IBPoolV2(_bpt).getLastInvariant());
        int256 numerator = totalPi.mul(invariant);

        price = uint256((numerator.toInt().div(totalSupply)));
        // price = totalFTM / totalSupply;
    }

    function _checkRatio(
        uint256 reserve0,
        uint256 reserve1,
        uint256 price0,
        uint256 price1
    ) internal view {
        uint256 value0 = reserve0 * price0;
        uint256 value1 = reserve1 * price1;
        uint256 diffLimit = (value0 * ratioDiffLimitNumerator) /
            ratioDiffLimitDenominator;

        require(
            value1 < value0 + diffLimit && value0 < value1 + diffLimit,
            "INVALID RATIO"
        );
    }
}
