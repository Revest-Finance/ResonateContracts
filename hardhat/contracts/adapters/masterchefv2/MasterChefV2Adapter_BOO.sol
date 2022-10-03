// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;
import "../../lib/ERC4626.sol";
import "../../lib/uniswap/IUniswapV2Router02.sol";
import "../../lib/uniswap/IUniswapV2Pair.sol";
import "../../lib/FixedPointMathLib.sol";
import "../../interfaces/IMasterChefV2_BOO.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @author RobAnon
 * @author 0xTraub
 * @author 0xTinder
 * @notice a contract for providing MasterChefV2 SpookySwap contracts with an ERC-4626 autocompounder
 *         Developed for Resonate.
 * @dev The initial deposit to this contract should be made immediately following deployment
 */
contract MasterChefV2Adapter_BOO is ERC4626 {
    using SafeMath for uint256;
    using SafeTransferLib for ERC20;
    using SafeERC20 for IERC20;
    using FixedPointMathLib for uint256;
    using Address for address;

    address public rewardToken;
 
    address public uniRouter;
    address public masterChef;

    address public lpPair;
    address public lpToken0;
    address public lpToken1;

    address public immutable WETH;

    address[] public rewardTokenToLp0Route;
    address[] public rewardTokenToLp1Route;

    uint lastCompound;
    uint256 poolId;

    constructor(
        ERC20 _asset,
        uint256 _poolId,
        address[] memory _rewardTokenToLp0Route,
        address[] memory _rewardTokenToLp1Route,
        address _uniRouter,
        address _masterChef,
        address _rewardToken,
        address _WETH
    ) ERC4626(_asset, "MasterChefAdapter", "MFA") { //TODO - Change those things
        
        //TODO - Ownership locks on contract
        WETH = _WETH;
        lpPair = address(_asset);
        poolId = _poolId;

        lpToken0 = IUniswapV2Pair(lpPair).token0();
        lpToken1 = IUniswapV2Pair(lpPair).token1();

        rewardTokenToLp0Route = _rewardTokenToLp0Route;
        rewardTokenToLp1Route = _rewardTokenToLp1Route;

        uniRouter = _uniRouter;
        masterChef = _masterChef;

        rewardToken = _rewardToken;
        giveAllowances();

    }

    
    function harvest() public {
        IMasterChefV2_BOO(masterChef).deposit(poolId, 0);
        addLiquidity();
        deposit();
    }

        /**
     * @dev Function that puts the funds to work.
     * It gets called whenever someone deposits in the strategy's vault contract.
     * It deposits {lpPair} in the masterChef to farm {rewardToken}
     */
    function deposit() public {
        uint256 pairBal = IERC20(lpPair).balanceOf(address(this));

        if (pairBal > 0) {
            IMasterChefV2_BOO(masterChef).deposit(poolId, pairBal, address(this));
        }

       
    }

    function valueRewardTokens() public view virtual returns (uint256 lpTokens) {
        uint totalBalance;
        try IMasterChefV2_BOO(masterChef).pendingBOO(poolId, address(this)) returns (uint256 bal) {
                totalBalance = bal;
            } catch {
                totalBalance = 0;
            }


        if (totalBalance > 1) {

            uint256 rewardTokenHalf = totalBalance.div(2);

            (uint reserveA, uint reserveB,) = IUniswapV2Pair(lpPair).getReserves();
            
            //if reward token is half of the pair then getAmounts out will just be the same as the input
            uint256 amountToken0Out = lpToken0 == rewardToken ? rewardTokenHalf : IUniswapV2Router02(uniRouter).getAmountsOut(rewardTokenHalf, rewardTokenToLp0Route)[rewardTokenToLp0Route.length.sub(1)];
            uint256 amountToken1Out = lpToken1 == rewardToken ? rewardTokenHalf : IUniswapV2Router02(uniRouter).getAmountsOut(rewardTokenHalf, rewardTokenToLp1Route)[rewardTokenToLp1Route.length.sub(1)];

            uint256 totalSupply = asset.totalSupply();
            uint256 _kLast = IUniswapV2Pair(lpPair).kLast();
            uint256 newSupply;

            if (_kLast != 0) {
                uint rootK = FixedPointMathLib.sqrt(uint(reserveA).mul(reserveB));
                uint rootKLast = FixedPointMathLib.sqrt(_kLast);

                if (rootK > rootKLast) {
                    uint numerator = totalSupply.mul(rootK.sub(rootKLast));
                    uint denominator = rootK.mul(5).add(rootKLast);
                    uint liquidity = numerator / denominator;
                    if (liquidity > 0) newSupply = totalSupply.add(liquidity);
                }
            }

            uint lpTokens0 = amountToken0Out.mulDivDown(newSupply, reserveA);
            uint lpTokens1 = amountToken1Out.mulDivDown(newSupply, reserveB);

            lpTokens = Math.min(lpTokens0, lpTokens1);
        }
    }



    function totalAssets() public view virtual override returns (uint256) {
        (uint256 amount, ) = IMasterChefV2_BOO(masterChef).userInfo(poolId, address(this));
        return amount.add(valueRewardTokens());
    }

    function deposit(uint256 assets, address receiver) public virtual override returns (uint256 shares) {
        // Check for rounding error since we round down in previewDeposit.
        require((shares = previewDeposit(assets)) != 0, "ZERO_SHARES");

        // Need to transfer before minting or ERC777s could reenter.
        asset.safeTransferFrom(msg.sender, address(this), assets);

        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);

        afterDeposit(assets, shares);
    }

    function afterDeposit(uint256 assets, uint256) internal virtual override {
        uint256 pairBal = asset.balanceOf(address(this));

        if (pairBal > 0) {
            IMasterChefV2_BOO(masterChef).deposit(poolId, pairBal, address(this));
        }

        uint totalBalance;
        try IMasterChefV2_BOO(masterChef).pendingBOO(poolId, address(this)) returns (uint256 bal) {
                totalBalance = bal;
            } catch {
                totalBalance = 0;
            }

        if (totalBalance > 1) {
            harvest();
        }

    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256 shares) {
        shares = previewWithdraw(assets); // No need to check for rounding error, previewWithdraw rounds up.

        //the issue is that shares is too high, previewWithdraw is incorrect

        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender]; // Saves gas for limited approvals.
            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }

        beforeWithdraw(assets, shares);
        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        asset.safeTransfer(receiver, assets);
    }

        function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override returns (uint256 assets) {
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender]; // Saves gas for limited approvals.

            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }

        // Check for rounding error since we round down in previewRedeem.
        require((assets = previewRedeem(shares)) != 0, "ZERO_ASSETS");

        beforeWithdraw(assets, shares);

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        asset.safeTransfer(receiver, assets);
    }

        /**
     * @dev Withdraws funds and sents them back to the vault.
     * It withdraws {lpPair} from the masterChef.
     * The available {lpPair} minus fees is returned to the vault.
     */
    function beforeWithdraw(uint256 assets, uint256 shares) internal virtual override {
        // require(msg.sender == vault, "!vault");
        //Sometimes masterChef throws an error trying to convert to a uint256 so this just prevents that error from being thrown
        uint totalBalance;
        try IMasterChefV2_BOO(masterChef).pendingBOO(poolId, address(this)) returns (uint256 bal) {
                totalBalance = bal;
            } catch {
                totalBalance = 0;
            }

        if (totalBalance > 1) {
            harvest();
        }

        uint256 pairBal = IERC20(lpPair).balanceOf(address(this));
        (uint256 maxWithdrawal, ) = IMasterChefV2_BOO(masterChef).userInfo(poolId, address(this));

        if (pairBal < assets) {
            IMasterChefV2_BOO(masterChef).withdraw(poolId, assets.sub(pairBal), address(this));
        }

    }

        /**
     * @dev Swaps {rewardToken} for {lpToken0}, {lpToken1} & {wftm} using SpookySwap.
     */
    function addLiquidity() internal {
        uint256 rewardTokenHalf = IERC20(rewardToken).balanceOf(address(this)).div(2);

        if (rewardTokenHalf <= 1) return;

        if (lpToken0 != rewardToken) {
            try IUniswapV2Router02(uniRouter).swapExactTokensForTokensSupportingFeeOnTransferTokens(rewardTokenHalf, 0, rewardTokenToLp0Route, address(this), block.timestamp.add(100)) {
               // Do Nothing
            } catch {
                return;
            }
        }

        if (lpToken1 != rewardToken) {
            try IUniswapV2Router02(uniRouter).swapExactTokensForTokensSupportingFeeOnTransferTokens(rewardTokenHalf, 0, rewardTokenToLp1Route, address(this), block.timestamp.add(600)) {
                // Do Nothing
            } catch {
                return;
            }
        }

        uint256 lp0Bal = IERC20(lpToken0).balanceOf(address(this));
        uint256 lp1Bal = IERC20(lpToken1).balanceOf(address(this));

        IUniswapV2Router02(uniRouter).addLiquidity(lpToken0, lpToken1, lp0Bal, lp1Bal, 1, 1, address(this), block.timestamp.add(600));
    }

     function giveAllowances() internal {
        IERC20(lpPair).safeApprove(masterChef, type(uint256).max);

        IERC20(rewardToken).safeApprove(uniRouter, 0);
        IERC20(rewardToken).safeApprove(uniRouter, type(uint256).max);

        IERC20(lpToken0).safeApprove(uniRouter, 0);
        IERC20(lpToken0).safeApprove(uniRouter, type(uint256).max);

        IERC20(lpToken1).safeApprove(uniRouter, 0);
        IERC20(lpToken1).safeApprove(uniRouter, type(uint256).max);
    }


}