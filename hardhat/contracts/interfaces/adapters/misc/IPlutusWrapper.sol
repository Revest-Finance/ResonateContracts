// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8;

import "../../IERC4626.sol";

interface whitelist {
    function whitelistAdd(address _addr) external;
    function owner() external returns (address);
    function setHandler(address _handler, bool _isActive) external;
    function gov() external returns (address);
    function isHandler(address _address) external returns (bool);
    function inPrivateTransferMode() external returns (bool);
}

interface rewardRouter {
    function mintAndStakeGlpETH(uint256 _minUsdg, uint256 _minGlp) payable external returns (uint256);
    function depositBalances(address account, address token) external returns (uint);
    function balanceOf(address account) external returns (uint);
    function stakedAmounts(address account) external returns (uint);
    function stake(address _depositToken, uint256 _amount) external;
    function gov() external returns (address);
    function setInPrivateStakingMode(bool _inPrivateStakingMode) external;
}

interface IStaker {
    function mintAndStakeGlp(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external returns (uint256);
}

interface IglpDepositor {
    function deposit(uint256 _amount) external;
    function redeem(uint256 _amount) external;
    function previewRedeem(address _addr, uint256 _shares) external view returns (uint256, uint256, uint256);
    function updatePartner(address _partnerAddr, uint32 _exitFee, uint32 _rebate, bool _isActive) external;
    function owner() external returns (address);
    function getFeeBp(address _addr) external view returns (uint256 _exitFee, uint256 _rebate);
}

interface IPlutusWrapper {
    error NotEnoughAvailableSharesForAmount();
    error NotEnoughAvailableAssetsForAmount();
}