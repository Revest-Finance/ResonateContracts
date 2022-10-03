pragma solidity >=0.8.0;

import "./IMasterChef.sol";

interface IMasterChefV2 is IMasterChef {
    function poolLength() external view returns (uint256);
    function setBooPerSecond(uint256 _rewardTokenPerSecond) external;
    function getMultiplier(uint256 _from, uint256 _to)
        external
        view
        returns (uint256);
    function pendingSushi(uint256 _pid, address _user)
        external
        view
        returns (uint256);
    function massUpdatePools() external;
    function updatePool(uint256 _pid) external;
    function deposit(uint256 _pid, uint256 _amount, address to) external;
    function withdraw(uint256 _pid, uint256 _amount, address to) external;
    function harvest(uint256 _pid, address to) external;
    function userInfo(uint256 _pid, address _user)
        external
        view
        returns (uint256, uint256);
    function emergencyWithdraw(uint256 _pid, address to) external;
}
