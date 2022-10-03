// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8;

import "./IVaultV1.sol";

struct StrategyParams {
    uint256 performanceFee;
    uint256 activation;
    uint256 debtRatio;
    uint256 minDebtPerHarvest;
    uint256 maxDebtPerHarvest;
    uint256 lastReport;
    uint256 totalDebt;
    uint256 totalGain;
    uint256 totalLoss;
}


interface ReaperAPI is IVaultV1 {

    function token() external view returns (address);
    
    // NB: This only exists on some ReaperFarm vaults
    function tvlCap() external view returns (uint256);

}

interface IReaperStrategy {

    function securityFee() external view returns (uint fee);
    function PERCENT_DIVISOR() external view returns (uint);
    function paused() external view returns (bool);
}