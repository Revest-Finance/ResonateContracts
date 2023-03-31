// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.12;

import "../../mocks/RariVault.sol";
import "../base/PermissionedAdapter.sol";
import "../../interfaces/adapters/jonesDAO/IJonesRouter.sol";
import {SafeTransferLib} from "../../lib/SafeTransferLib.sol";
import {FixedPointMathLib} from "../../lib/FixedPointMathLib.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @author 0xTraub
 * @notice a contract for providing JonesDAO contracts with an ERC-4626-compliant interface
 *         Developed for Resonate.
 * @dev The initial deposit to this contract should be made immediately following deployment
 */
contract jGLPAdapter is PermissionedAdapter, RariVault {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    address immutable adapter;
    address immutable router;
    address immutable vault;
    address immutable feeHelper;
    address immutable whitelist;
    address immutable GVRT;
    address immutable DUST_WALLET;
    address constant public GLP = 0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258;

    bytes32 public constant RESONATE_ROLE = bytes32("RESONATE");

    error NotEnoughAvailableSharesForAmount();
    error SpenderDoesNotHaveApprovalToBurnShares();
    error NoAvailableShares();

    constructor(ERC20 _asset, address _adapter, address _router, address _vault, address _feeHelper, address _whitelist, address _GVRT, address _dust_wallet) RariVault(_asset) {
        adapter = _adapter;
        router = _router;
        vault = _vault;
        feeHelper = _feeHelper;
        whitelist = _whitelist;
        GVRT = _GVRT;
        DUST_WALLET = _dust_wallet;

        _asset.approve(_adapter, type(uint256).max);
        ERC20(GLP).approve(_adapter, type(uint256).max);

    }

    function totalAssets() public view virtual override returns (uint256) {
        uint totalShares = ERC20(vault).balanceOf(address(this));

        return IJonesFeeCalculator(feeHelper).getGlpRedemption(totalShares, address(this));
    }

    /*///////////////////////////////////////////////////////////////
                    Deposit Functions
    //////////////////////////////////////////////////////////////*/
    function afterDeposit(uint256 assets, uint256 shares) internal virtual override {
        IJonesAdapter(adapter).depositGlp(assets, true);
    }

    function mint(uint256 shares, address receiver) public virtual override onlyResonateWallets returns (uint256 assets) {
        return super.mint(shares, receiver);
    }

    function deposit(uint256 assets, address receiver) public virtual override onlyResonateWallets returns (uint256 shares) {
        return super.deposit(assets, receiver);
    }

    /*///////////////////////////////////////////////////////////////
                    Withdrawal Functions
    //////////////////////////////////////////////////////////////*/

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override onlyResonateWallets nonReentrant returns (uint256 shares) {

        (uint256 _withdrawn, uint256 _burntShares) = _withdraw(
            assets,
            receiver,
            owner
        );

        emit Withdraw(msg.sender, receiver, owner, _withdrawn, _burntShares);
        return _burntShares;
    }

    function _withdraw(
        uint256 amount,
        address receiver,
        address sender
    ) internal returns (uint256 assets, uint256 shares) {
        uint adjustedAmount = calculateAssetsPlusFee(amount); //the amount of assets needed before fee to get withdrawal amount
        shares = _previewWithdraw(adjustedAmount); //this means X number of shares required to be owned by the user
        uint jonesShares = convertAssetsToJonesShares(adjustedAmount);//the adjusted assets means x JUSDC needed to be burned 

        uint GlpRedemption = IJonesFeeCalculator(feeHelper).getGlpRedemption(jonesShares, address(this));

        require(GlpRedemption >= amount, "invalid redemption amount");

        uint beforeTokenBal = asset.balanceOf(address(this));
        _doWithdrawal(shares, jonesShares, sender);

        // the chance in the number of assets from _doWithdrawal
        assets = asset.balanceOf(address(this)) - beforeTokenBal;

        // If slippage has resulted in failure to withdraw at least amount, revert
        if(assets < amount) {
            revert NotEnoughAvailableSharesForAmount();
        }
        
        // Transfer excactly desired amount to receiver, in accordance with EIP-4626 spec
        asset.safeTransfer(receiver, amount);

        // Transfer any remaining dust to dust wallet
        uint dust = assets + beforeTokenBal - amount;
        if(dust > 0) {
            asset.safeTransfer(DUST_WALLET, dust);
        }
        // Final assignment of return value
        assets = amount;
    }

    function _doWithdrawal(
        uint shares, 
        uint jonesShares, 
        address sender
    ) internal {
        if (sender != msg.sender) {
            uint currentAllowance = this.allowance(sender, msg.sender);
            if(currentAllowance < shares) {
                revert SpenderDoesNotHaveApprovalToBurnShares();
            }
            allowance[sender][msg.sender] -= (currentAllowance - shares);
        }

        // Zero-case handling
        if(jonesShares == 0 || shares == 0) {
            revert NoAvailableShares();
        }

        // Insufficient shares handling
        if (shares > this.balanceOf(sender) || jonesShares > ERC20(vault).balanceOf(address(this))) {
            revert NotEnoughAvailableSharesForAmount();
        }

        // Burn shares from user
        _burn(sender, shares);

        IJonesRouter(router).redeemGlp(jonesShares, true);
    }

    /*///////////////////////////////////////////////////////////////
                    Redemption Functions
    //////////////////////////////////////////////////////////////*/

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override onlyResonateWallets nonReentrant returns (uint256 assets) {
        require(shares != 0, "ZERO_SHARES");
        
        (uint256 _withdrawn, uint256 _burntShares) = _redeem(
            shares,
            receiver,
            owner
        );

        require(_burntShares == shares, "must burn exactly the same number of shares");

        emit Withdraw(msg.sender, receiver, owner, _withdrawn, _burntShares);
        assets = _withdrawn;
    }

    function _redeem(
        uint256 shares, 
        address receiver,
        address sender
    ) internal returns (uint256 assets, uint256 sharesBurnt) {
        uint jonesShares = convertSharesToJonesShares(shares);

        uint beforeTokenBal = asset.balanceOf(address(this));
        _doWithdrawal(shares, jonesShares, sender);

        assets = asset.balanceOf(address(this)) - beforeTokenBal;
        sharesBurnt = shares;

        asset.safeTransfer(receiver, assets);

        if(beforeTokenBal > 0) {
            asset.safeTransfer(DUST_WALLET, beforeTokenBal);
        }
    }

    /*///////////////////////////////////////////////////////////////
                    Preview Functions
    //////////////////////////////////////////////////////////////*/

    function previewRedeem(uint256 shares)
        public
        view
        override
        returns (uint256 assets)
    {
        uint ySupply = ERC20(vault).balanceOf(address(this)); 
        uint jonesShares = ySupply == 0 ? shares : shares.mulDivUp(ySupply, totalSupply);
        jonesShares = Math.min(ySupply, jonesShares);
        assets = IJonesFeeCalculator(feeHelper).getGlpRedemption(jonesShares, address(this));
    }

    function previewMint(uint256 shares) public view virtual override returns (uint256) {
        uint supply = totalSupply;
        uint localAssets = convertJonesSharesToAssets(ERC20(vault).balanceOf(address(this)));
        return supply == 0 ? shares : shares.mulDivUp(localAssets, supply);
    }

    function previewWithdraw(uint256 assets)
        public
        view
        override
        returns (uint256 shares)
    {       
        uint adjustedAmount = calculateAssetsPlusFee(assets);
        return _previewWithdraw(adjustedAmount);
    }

    function _previewWithdraw(uint adjustedAmount) internal view returns (uint shares) {

        uint supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.
        uint totalShares = ERC20(vault).balanceOf(address(this));

        uint localAssets = convertJonesSharesToAssets(totalShares); //assets held by this adapter

        return localAssets == 0 ? adjustedAmount : adjustedAmount.mulDivUp(supply, localAssets); 
    }

    /*///////////////////////////////////////////////////////////////
                    Asset/Share Conversion Logic
    //////////////////////////////////////////////////////////////*/

    function convertToShares(uint256 assets)
        public
        view
        override
        returns (uint256)
    {
        uint supply = totalSupply;
        uint localAssets = convertJonesSharesToAssets(ERC20(vault).balanceOf(address(this)));

        return supply == 0 ? assets : assets.mulDivDown(supply, localAssets); 
    }

    function convertToAssets(uint256 shares) public view override returns (uint assets) {
        uint supply = totalSupply;
        uint localAssets = convertJonesSharesToAssets(ERC20(vault).balanceOf(address(this)));
        return supply == 0 ? shares : shares.mulDivDown(localAssets, supply);
    }

    function convertSharesToJonesShares(uint shares) internal view returns (uint yShares) {
        uint supply = totalSupply; 
        return supply == 0 ? shares : shares.mulDivUp(ERC20(vault).balanceOf(address(this)), supply);
    }

    function convertAssetsToJonesShares(uint assets) internal view returns (uint) {
        uint256 totalJonesShares = ERC20(vault).totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        uint totalGVRT = ERC4626(vault).totalAssets();

        uint totalJonesAssets = IJonesFeeCalculator(feeHelper).sharesToGlp(totalGVRT);

       return totalJonesAssets == 0 ? assets : assets.mulDivUp(totalJonesShares, totalJonesAssets);
    }

    function convertJonesSharesToAssets(uint jonesShares) internal view returns (uint assets) {
        uint supply = ERC20(vault).totalSupply();

        return supply == 0 ? jonesShares : jonesShares * (ERC4626(GVRT).totalAssets()) / supply;
    }    

    //The amount of tokens you need to withdraw to get the amount you want after fee is applied
    function calculateAssetsPlusFee(uint assets) internal view returns (uint adjustedAmount) {
        uint BASIS_POINTS = IJonesVault(vault).BASIS_POINTS();
        uint retention = IJonesWhitelist(whitelist).getRoleInfo(RESONATE_ROLE).jGLP_RETENTION;

        JonesGlpLeverageStrategy strategy = IJonesFeeCalculator(feeHelper).contracts().strategy;
        uint gmxRetentionAmount = strategy.glpRedeemRetention(assets);

        uint GMX_FEE = gmxRetentionAmount.mulDivUp(BASIS_POINTS, assets);

        retention += GMX_FEE;

        //by subtracting retention you've multiplied by >1 so you get the amount needed
        // 10 * 1.02 = 10.2 you've calculated the 1.02x
        adjustedAmount = assets.mulDivUp(BASIS_POINTS, BASIS_POINTS - retention);
    }

    /*///////////////////////////////////////////////////////////////
                     DEPOSIT/WITHDRAWAL LIMIT LOGIC
    //////////////////////////////////////////////////////////////*/

    function maxDeposit(address) public view virtual override returns (uint256) {
        if (IJonesRouter(router).paused()) return 0;
        //does not use flexible cap

        else return type(uint256).max;
    }

    function maxMint(address) public view virtual override returns (uint256) {
        //maxDeposit address doesn't matter so just use (0)
        return type(uint256).max;

    }

    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        if (IJonesRouter(router).emergencyPaused()) return 0;

        //The users' owned percent of the jGLP
        uint jGLPShares = convertSharesToJonesShares(balanceOf[owner]);
        
        //How much that corresponds to after fees
        return IJonesFeeCalculator(feeHelper).getGlpRedemption(jGLPShares, address(this));
    }
    

    function maxRedeem(address owner) public view virtual override returns (uint256) {
        if (IJonesRouter(router).emergencyPaused()) return 0;

        return balanceOf[owner];
    }


}