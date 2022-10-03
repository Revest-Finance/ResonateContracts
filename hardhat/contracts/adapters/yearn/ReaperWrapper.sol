// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.12;

import {ReaperAPI, IReaperStrategy} from "../../interfaces/adapters/yearn/ReaperAPI.sol";
import "../base/YearnV1_4626.sol";

/**
 * @author RobAnon
 * @author 0xTraub
 * @author 0xTinder
 * @notice a contract for providing Reaper Farm Yearn V1 contracts with an ERC-4626-compliant interface
 *         Developed for Resonate.
 * @dev The initial deposit to this contract should be made immediately following deployment
 */
contract ReaperWrapper is YearnV1_4626 {

    using SafeERC20 for IERC20;
    using FixedPointMathLib for uint;

    ReaperAPI public immutable yVault;

    address public immutable token;
    uint256 public immutable _decimals;

    constructor(address _vault, address _dustWallet)
        ERC20(
            "Reaper-4646-Adapter",
            "Reaper-4646"
        )
        YearnV1_4626(_dustWallet)
    {
        yVault = ReaperAPI(_vault);
        
        token = yVault.token();
        _decimals = uint8(yVault.decimals());
        IERC20(token).approve(address(yVault), type(uint).max);
    }


    /*//////////////////////////////////////////////////////////////
                    DEPOSIT/WITHDRAWAL LIMIT LOGIC
  //////////////////////////////////////////////////////////////*/
    

    function maxDeposit(address)
        public
        view
        override
        returns (uint256)
    {
        ReaperAPI _bestVault = yVault;

        IReaperStrategy strat = IReaperStrategy(yVault.strategy());
        if (strat.paused()) return 0;

        uint256 _totalAssets = _bestVault.balance();
        uint _depositLimit;
        try _bestVault.tvlCap() returns (uint dL) {
            _depositLimit = dL;
        } catch(bytes memory) {}
        if (_totalAssets >= _depositLimit) return 0;
        return _depositLimit - _totalAssets;
    }

    
    function maxMint(address _account)
        external
        view
        override
        returns (uint256)
    {
        return convertToShares(maxDeposit(_account));
    }

   
    function maxWithdraw(address owner)
        external
        view
        override
        returns (uint256)
    {
        return convertToAssets(this.balanceOf(owner));
    }

    
    function maxRedeem(address owner) external view override returns (uint256) {
        return this.balanceOf(owner);
    }

    /*//////////////////////////////////////////////////////////////
                      View Methods
   //////////////////////////////////////////////////////////////*/

    function calculateAssetsPlusFee(uint assets) internal view override returns (uint adjustedAmount) {
        ReaperAPI _vault = yVault;
        {
            IReaperStrategy strat = IReaperStrategy(_vault.strategy());
            uint securityFee = strat.securityFee();
            uint DIVISOR = strat.PERCENT_DIVISOR();
            adjustedAmount = assets.mulDivUp(DIVISOR, DIVISOR - securityFee);
        }
    }

    function calculateAssetsLessFee(uint assets) internal view override returns (uint adjustedAmount) {
        ReaperAPI _vault = yVault;
        {
            IReaperStrategy strat = IReaperStrategy(_vault.strategy());
            uint securityFee = strat.securityFee();
            uint DIVISOR = strat.PERCENT_DIVISOR();
            assets -= assets.mulDivUp(securityFee, DIVISOR);
        }
        adjustedAmount = assets;
    }

    function getDecimals() internal view override returns (uint8) {
        return uint8(_decimals);
    }

    function getToken() internal view override returns (IERC20 _token) {
        return IERC20(token);
    }

    function getVault() internal view override returns (IVaultV1 _vault) {
        return yVault;
    }

    function asset() external view override returns (address) {
        return token;
    }


}