// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

struct RoleInfo {
        bool jGLP_BYPASS_CAP;
        bool jUSDC_BYPASS_TIME;
        uint256 jGLP_RETENTION;
        uint256 jUSDC_RETENTION;
    }

struct Contracts {
        JonesGlpVault glpVault;
        JonesGlpVaultRouter router;
        GlpJonesRewards jonesRewards;
        JonesGlpRewardTracker glpTracker;
        JonesGlpRewardTracker stableTracker;
        JonesGlpLeverageStrategy strategy;
        JonesGlpStableVault stableVault;
        JonesGlpCompoundRewards glpCompounder;
        JonesGlpCompoundRewards stableCompounder;
        IGMXVault gmxVault;
        WhitelistController controller;
        GlpAdapter adapter;
}


interface IJonesAdapter {
    function depositStable(uint256 _assets, bool _compound) external returns (uint256);
    function depositGlp(uint256 _assets, bool _compound) external returns (uint256);
    function redeemGlpBasket(uint256 _shares, bool _compound, address _token, bool _native) external returns (uint256);
    function useFlexibleCap() external view returns (bool);
    function getUsdcCap() external view returns (uint256);
    function stableVault() external view returns (IJonesGlpStableVault);
}

interface IJonesRouter {
    function stableWithdrawalSignal(uint256 _shares, bool _compound) external returns (uint256);
    function redeemGlp(uint256 _shares, bool _compound) external returns (uint256);
    
    function paused() external view returns (bool);
    function emergencyPaused() external view returns (bool);
}

interface IJonesGlpStableVault {
    function tvl() external view returns (uint256);
}

interface IJonesVault {
    function BASIS_POINTS() external view returns (uint256);
}

interface IJonesFeeCalculator {
    function getUSDCRedemption(uint256 _jUSDC, address _caller) external view returns (uint256);
    function getUSDCRatio(uint256 _jUSDC) external view returns (uint256);
    function getGlpRedemption(uint256 _jGLP, address _caller) external view returns (uint256);
    function sharesToUSDC(uint256 _shares) external view returns (uint256);
    function sharesToGlp(uint256 _shares) external view returns (uint256);

    function contracts() external view returns (Contracts memory);
}

interface IJonesWhitelist {
    function getRoleInfo(bytes32) external view returns (RoleInfo calldata);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function getUserRole(address _user) external view returns (bytes32);
}

//Literally I don't care about any of these but you need them to handle some structs in Jones contracts
interface JonesGlpVault {}
interface JonesGlpVaultRouter {}
interface GlpJonesRewards {}
interface JonesGlpRewardTracker {}
interface JonesGlpLeverageStrategy {
    function glpRedeemRetention(uint256 _glpAmount) external view returns (uint256);
}
interface JonesGlpStableVault {}
interface JonesGlpCompoundRewards {}
interface IGMXVault {}
interface WhitelistController {}
interface GlpAdapter {}