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


interface BeefyAPI is IVaultV1 {
    
    // Instead of token()
    function want() external view returns (IERC20);
    
}

interface IBeefyStrat {
    function withdrawalFee() external view returns (uint fee);
    function WITHDRAWAL_MAX() external view returns (uint divisor);
    function paused() external view returns (bool);
}