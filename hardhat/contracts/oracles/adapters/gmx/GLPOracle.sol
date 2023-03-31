// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../ProviderAwareOracle.sol";
import "../../interfaces/CurveTokenInterface.sol";
import "./IGLPManager.sol";

contract GLPOracle is ProviderAwareOracle {

    IGLPManager public glpManager;
    address public immutable GLP;
    address public immutable sGLP;
    address public immutable USDC;
    uint private GLP_PRECISION = 10 ** 30;
    constructor(
        address _provider, 
        address _GLP, 
        address _sGLP, 
        address _glpManager, 
        address _USDC
    ) ProviderAwareOracle(_provider) {
        GLP = _GLP;
        sGLP = _sGLP;
        glpManager = IGLPManager(_glpManager);
        USDC = _USDC;
    }

    function migrateGlpManager(address _newGlpManager) external onlyOwner {
        glpManager = IGLPManager(_newGlpManager);
    }

    function getSafePrice(address token) external view override returns (uint256 _amountOut) {
        require(token == GLP || token == sGLP, "UNSUPPORTED");
        _amountOut = getGlpPrice();
    }

    /// @dev This method has no guarantee on the safety of the price returned. It should only be
    //used if the price returned does not expose the caller contract to flashloan attacks.
    function getCurrentPrice(address token) external view override returns (uint256 _amountOut) {
        require(token == GLP || token == sGLP, "UNSUPPORTED");
        _amountOut = getGlpPrice();
    }

    /// @dev Gets the safe price, no updates necessary
    function updateSafePrice(address token) external view override returns (uint256 _amountOut) {
        require(token == GLP || token == sGLP, "UNSUPPORTED");
        _amountOut = getGlpPrice();
    }

    /**
     * @notice Get price for glp token
     * @return The price
     */
    function getGlpPrice() internal view returns (uint256) {

        // get glp / usd * E30
        uint glp_usd = glpManager.getPrice(false);

        // get usdc / eth * E18
        uint usd_eth = provider.getSafePrice(USDC);

        // multiply first to preserve precision
        return (glp_usd * usd_eth) / GLP_PRECISION;
    }

}