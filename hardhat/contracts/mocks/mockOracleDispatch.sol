// SPDX-License-Identifier: GNU-GPL v3.0 or later

pragma solidity >=0.8.0;

import "../interfaces/IPriceOracle.sol";


/**
 * @title Provider interface for Revest FNFTs
 * @dev Address locks MUST be non-upgradeable to be considered for trusted status
 *
 */
contract mockOracleDispatch is IPriceOracle {

    uint private constant MIN_TIME = 45 minutes;
    
    constructor() {

    }
    
    mapping(address => uint) prices;

    function setPrice(address asset, uint price) external {
        prices[asset] = price;
    }

    
    function getSafePrice(address token) external view returns (uint256 _amountOut) {
        return prices[token];
    }

    /// @dev This method has no guarantee on the safety of the price returned. It should only be
    //used if the price returned does not expose the caller contract to flashloan attacks.
    function getCurrentPrice(address token) external view returns (uint256 _amountOut) {
        return prices[token];
    }

    /// @dev This method returns a flashloan resistant price, but doesn't
    //have the view modifier which makes it convenient to update
    //a uniswap oracle which needs to maintain the TWAP regularly.
    //You can use this function while doing other state changing tx and
    //make the callers maintain the oracle.
    function updateSafePrice(address token) external returns (uint256 _amountOut) {
        return prices[token];
    }

  
}
