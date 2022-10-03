// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import "../ProviderAwareOracle.sol";
import "../../PriceProvider.sol";

interface IFTMStaking {
    function getExchangeRate() external view returns (uint256);
}

/**
 * @author 0xTinder for Revest Finance
 * Simple sFTMx oracle to return the price of sFTMx in terms of WETH. References the
 * exchange rate tracked in the FTMStaking contract found:
 * https://ftmscan.deth.net/address/0xB458BfC855ab504a8a327720FcEF98886065529b#readProxyContract
 */
contract sFTMxOracle is ProviderAwareOracle {
    address wFTM;
    IFTMStaking FTMStaking;
    /**
     * @param _provider address of the Revest PriceProvider
     * @param _wFTM address of WFTM
     * @param _FTMStaking address of the sFTMx staking contract
     */
    constructor(address _provider, address _wFTM, address _FTMStaking)
        ProviderAwareOracle(_provider)
    {
        wFTM = _wFTM;
        FTMStaking = IFTMStaking(_FTMStaking);
    }
    /**
     * @notice get the flashloan resistant price for sFTMx
     * @param "" included for interface compliance
     * @return _amountOut the sFTMx/WETH exchange rate
     */
    function getSafePrice(address) public view returns (uint256 _amountOut) {
        // get the current price of wFTM
        uint256 ftmPrice = provider.getSafePrice(wFTM);

        // get the current xrate
        uint256 xrate = FTMStaking.getExchangeRate();

        return ftmPrice * xrate / 1e18;
    }
    /**
     * @notice get the current price for sFTMx
     * @param "" included for interface compliance
     * @return _amountOut the sFTMx/WETH exchange rate
     * @dev `getSafePrice` and `getCurrentPrice` differ only by their call to priceProvider,
     * however in prod only getSafePrice is used.
     */
    function getCurrentPrice(address)
        public
        view
        returns (uint256 _amountOut)
    {
        // get the current price of wFTM
        uint256 ftmPrice = provider.getCurrentPrice(wFTM);

        // get the current xrate
        uint256 xrate = FTMStaking.getExchangeRate();

        return ftmPrice * xrate / 1e18;
    }

    /// @dev this isn't relevant for chainlink based oracles
    function updateSafePrice(address token)
        external
        view
        returns (uint256 _amountOut)
    {
        return getCurrentPrice(token);
    }
}