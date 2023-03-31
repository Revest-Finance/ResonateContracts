pragma solidity >=0.8.0;

import "./IMasterChef.sol";

interface IMasterChefV2_CROWD is IMasterChef {

    struct LPStakeholder {
        uint256 userRewardPerTokenPaid;
        uint256 lpRewards;
        uint256 userLpBalance;
        bool exist;
    }

    function updatePool(uint256 _pid) external;
    function stakeLP(uint256 _amount, address _account) external;

    function withdraw(uint256 _lpAmount, address _originAccount) external returns (uint256, uint256);
    function withdrawRewards(uint256 _lpRewards, address _receiverAccount) external returns (uint256);
    function withdrawByOwner(uint256 _lpRewards, address _originAccount) external returns (uint256);
   
   function balanceOf(address _account) external view returns (uint256);

   function earned(address _account) external view returns (uint256);

   function lpStakeholders(address _account) external view returns (LPStakeholder calldata);
}
