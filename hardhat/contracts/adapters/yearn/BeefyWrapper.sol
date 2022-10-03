// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.12;


import {BeefyAPI, IBeefyStrat, IVaultV1} from "../../interfaces/adapters/yearn/BeefyAPI.sol";
import "../base/YearnV1_4626.sol";

/**
 * @author RobAnon
 * @author 0xTraub
 * @author 0xTinder
 * @notice a contract for providing Beefy Finance Yearn V1 contracts with an ERC-4626-compliant interface
 *         Developed for Resonate.
 * @dev The initial deposit to this contract should be made immediately following deployment
 */
contract BeefyWrapper is YearnV1_4626 {

    using SafeERC20 for IERC20;
    using FixedPointMathLib for uint;

    BeefyAPI public immutable yVault;

    address public immutable token;
    uint256 public immutable _decimals;

    constructor(address _vault, address _dustWallet)
        ERC20(
            "Beefy-4646-Adapter",
            "Beefy-4646"
        )
        YearnV1_4626(_dustWallet)
    {
        yVault = BeefyAPI(_vault);
        token = address(yVault.want());
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
        IBeefyStrat strat = IBeefyStrat(yVault.strategy());
        if (strat.paused()) return 0;
        return 2 ** 256 - 1;
    }

    function maxMint(address _account)
        external
        view
        override
        returns (uint256 shares)
    {
        uint256 max = maxDeposit(_account);
        return max == (2**256 - 1) ? max : convertToShares(max);
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
                      ERC20 compatibility
   //////////////////////////////////////////////////////////////*/

   function calculateAssetsPlusFee(uint assets) internal view override returns (uint adjustedAmount) {
        BeefyAPI _vault = yVault;
        {
            IBeefyStrat strat = IBeefyStrat(_vault.strategy());
            uint fee = strat.withdrawalFee();
            uint DIVISOR = strat.WITHDRAWAL_MAX();
            adjustedAmount = assets.mulDivUp(DIVISOR, DIVISOR - fee);
        }
    }

    function calculateAssetsLessFee(uint assets) internal view override returns (uint adjustedAmount) {
        BeefyAPI _vault = yVault;
        {
            IBeefyStrat strat = IBeefyStrat(_vault.strategy());
            uint fee = strat.withdrawalFee();
            uint DIVISOR = strat.WITHDRAWAL_MAX();
            assets -= assets.mulDivUp(fee, DIVISOR);
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