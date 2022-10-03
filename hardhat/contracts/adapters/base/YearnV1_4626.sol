// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/adapters/yearn/IVaultWrapper.sol";
import "../../interfaces/adapters/yearn/IVaultV1.sol";
import "../../interfaces/IERC4626.sol";

import {FixedPointMathLib} from "../../lib/FixedPointMathLib.sol";


/**
 * @author RobAnon
 * @author 0xTraub
 * @author 0xTinder
 */
abstract contract YearnV1_4626 is ERC20, IVaultWrapper, IERC4626, ReentrancyGuard {

    using SafeERC20 for IERC20;
    using FixedPointMathLib for uint;

    address public immutable DUST_WALLET;

    constructor(address _dustWallet) {
        DUST_WALLET = _dustWallet;
    }

    ///
    /// Virtual Method Declarations
    ///

    function getDecimals() internal view virtual returns(uint8 decimals);
    function getToken() internal view virtual returns (IERC20 _token);
    function getVault() internal view virtual returns (IVaultV1 _vault);

    function calculateAssetsPlusFee(uint assets) internal view virtual returns (uint adjustedAmount);
    function calculateAssetsLessFee(uint assets) internal view virtual returns (uint adjustedAmount);

    /*//////////////////////////////////////////////////////////////
                          ACCOUNTING LOGIC
  //////////////////////////////////////////////////////////////*/

    function vault() external view returns (address) {
        return address(getVault());
    }

    // NOTE: this number will be different from this token's totalSupply
    function vaultTotalSupply() external view returns (uint256) {
        return getVault().totalSupply();
    }

    function totalAssets() public view override returns (uint256) {
        IVaultV1 _vault = getVault();
        return convertYearnSharesToAssets(_vault.balanceOf(address(this)), _vault);
    }

    function convertToShares(uint256 assets)
        public
        view
        override
        returns (uint256)
    {
        IVaultV1 _vault = getVault();
        uint supply = totalSupply();
        uint localAssets = convertYearnSharesToAssets(_vault.balanceOf(address(this)), _vault);
        
        return supply == 0 ? assets : assets.mulDivDown(supply, localAssets); 
    }

    function convertToAssets(uint256 shares) public view override returns (uint assets) {
        IVaultV1 _vault = getVault();
        uint supply = totalSupply();
        uint localAssets = convertYearnSharesToAssets(_vault.balanceOf(address(this)), _vault);
        return supply == 0 ? shares : shares.mulDivDown(localAssets, supply);
    }

    function previewDeposit(uint256 assets)
        public
        view
        override
        returns (uint256 shares)
    {
        return convertToShares(assets);
    }

    function previewWithdraw(uint256 assets)
        public
        view
        override
        returns (uint256 shares)
    {       
        IVaultV1 _vault = getVault();
        uint adjustedAmount = calculateAssetsPlusFee(assets);
        return _previewWithdraw(adjustedAmount, _vault);
    }

    function previewMint(uint256 shares)
        public
        view
        override
        returns (uint256 assets)
    {
        IVaultV1 _vault = getVault();
        uint supply = totalSupply();
        uint localAssets = convertYearnSharesToAssets(_vault.balanceOf(address(this)), _vault);
        return supply == 0 ? shares : shares.mulDivUp(localAssets, supply);
    }

    function previewRedeem(uint256 shares)
        public
        view
        override
        returns (uint256 assets)
    {
        IVaultV1 _vault = getVault();
        uint ySupply = _vault.balanceOf(address(this)); 
        uint yearnShares = ySupply == 0 ? shares : shares.mulDivDown(ySupply, totalSupply());
        yearnShares = Math.min(_vault.balanceOf(address(this)), yearnShares);
        assets = calculateAssetsLessFee(convertYearnSharesToAssets(yearnShares, _vault));
    }

      /*//////////////////////////////////////////////////////////////
                      DEPOSIT/WITHDRAWAL LOGIC
  //////////////////////////////////////////////////////////////*/

    function deposit(
        uint256 assets, 
        address receiver
    ) public virtual override nonReentrant returns (uint256 shares) {
        (assets, shares) = _deposit(assets, receiver, msg.sender);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(
        uint256 shares, 
        address receiver
    ) public virtual override nonReentrant returns (uint256 assets) {
        assets = previewMint(shares);
        uint256 expectedMint = shares;
        (assets, shares) = _deposit(assets, receiver, msg.sender);

        require(shares == expectedMint, "Amount of shares minted does not match requested amount");

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override nonReentrant returns (uint256 shares) {

        (uint256 _withdrawn, uint256 _burntShares) = _withdraw(
            assets,
            receiver,
            owner
        );

        emit Withdraw(msg.sender, receiver, owner, _withdrawn, _burntShares);
        return _burntShares;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override nonReentrant returns (uint256 assets) {
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

    ///
    /// Write Methods
    ///

    function _deposit(
        uint256 amount,
        address receiver,
        address depositor
    ) internal returns (uint256 deposited, uint256 mintedShares) {
        IVaultV1 _vault = getVault();
        IERC20 _token = getToken();

        if (amount == type(uint256).max) {
            amount = Math.min(
                _token.balanceOf(depositor),
                _token.allowance(depositor, address(this))
            );
        }

        _token.safeTransferFrom(depositor, address(this), amount);

        uint _allowance = _token.allowance(address(this), address(_vault));
        if (_allowance < amount) {
            if (_allowance > 0) {
                _token.safeApprove(address(_vault), 0);
            }
            _token.safeApprove(address(_vault), type(uint256).max);
        }

        uint256 beforeTokenBal = _token.balanceOf(address(this));
        mintedShares = previewDeposit(amount);
        _vault.deposit(amount);

        uint256 afterBal = _token.balanceOf(address(this));
        deposited = beforeTokenBal - afterBal;

        require(deposited == amount, "All assets not deposited");
        // afterDeposit custom logic
        _mint(receiver, mintedShares);
    }

    function _withdraw(
        uint256 amount,
        address receiver,
        address sender
    ) internal returns (uint256 assets, uint256 shares) {
        IERC20 _token = getToken();
        IVaultV1 _vault = getVault();
        
        uint adjustedAmount = calculateAssetsPlusFee(amount);
        shares = _previewWithdraw(adjustedAmount, _vault);
        uint yearnShares = convertAssetsToYearnShares(adjustedAmount, _vault);

        uint beforeTokenBal = _token.balanceOf(address(this));
        _doWithdrawal(shares, yearnShares, sender, _vault);

        assets = _token.balanceOf(address(this)) - beforeTokenBal;

        // If slippage has resulted in failure to withdraw at least amount, revert
        if(assets < amount) {
            revert NotEnoughAvailableSharesForAmount();
        }

        // Transfer excactly desired amount to receiver, in accordance with EIP-4626 spec
        _token.safeTransfer(receiver, amount);

        // Transfer any remaining dust to dust wallet
        uint dust = assets + beforeTokenBal - amount;
        if(dust > 0) {
            _token.safeTransfer(DUST_WALLET, dust);
        }
        // Final assignment of return value
        assets = amount;
    }

    function _redeem(
        uint256 shares, 
        address receiver,
        address sender
    ) internal returns (uint256 assets, uint256 sharesBurnt) {
        IERC20 _token = getToken();
        IVaultV1 _vault = getVault();
        uint yearnShares = convertSharesToYearnShares(shares, _vault);

        uint beforeTokenBal = _token.balanceOf(address(this));
        _doWithdrawal(shares, yearnShares, sender, _vault);

        assets = _token.balanceOf(address(this)) - beforeTokenBal;
        sharesBurnt = shares;

        _token.safeTransfer(receiver, assets);

        // TODO: Do we need a dust handler for shares themselves? 
        if(beforeTokenBal > 0) {
            _token.safeTransfer(DUST_WALLET, beforeTokenBal);
        }
    }

    function _doWithdrawal(
        uint shares, 
        uint yearnShares, 
        address sender,
        IVaultV1 _vault
    ) internal {
        if (sender != msg.sender) {
            uint currentAllowance = allowance(sender, msg.sender);
            if(currentAllowance < shares) {
                revert SpenderDoesNotHaveApprovalToBurnShares();
            }
            _approve(sender, msg.sender, currentAllowance - shares);
        }

        // Zero-case handling
        if(yearnShares == 0 || shares == 0) {
            revert NoAvailableShares();
        }

        // Insufficient shares handling
        if (shares > balanceOf(sender) || yearnShares > _vault.balanceOf(address(this))) {
            revert NotEnoughAvailableSharesForAmount();
        }

        // Burn shares from user
        _burn(sender, shares);

        // Withdraw from vault
        _vault.withdraw(yearnShares);
    }


    ///
    /// View Methods
    ///

    function convertAssetsToYearnShares(uint assets, IVaultV1 _vault) internal view returns (uint yShares) {
        uint256 totalYearnShares = _vault.totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        uint totalYearnAssets = _vault.balance();
        return totalYearnAssets == 0 ? assets : assets.mulDivUp(totalYearnShares, totalYearnAssets);
    }

    function convertYearnSharesToAssets(uint yearnShares, IVaultV1 _vault) internal view returns (uint assets) {
        uint supply = _vault.totalSupply();
        return supply == 0 ? yearnShares : yearnShares * _vault.balance() / supply;
    }

    function convertSharesToYearnShares(uint shares, IVaultV1 _vault) internal view returns (uint yShares) {
        uint supply = totalSupply(); 
        return supply == 0 ? shares : shares.mulDivUp(_vault.balanceOf(address(this)), totalSupply());
    }

    function _previewWithdraw(uint adjustedAmount, IVaultV1 _vault) internal view returns (uint shares) {
        uint supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        uint localAssets = convertYearnSharesToAssets(_vault.balanceOf(address(this)), _vault);
        return localAssets == 0 ? adjustedAmount : adjustedAmount.mulDivUp(supply, localAssets); 
    }

    
    ///
    /// Overridden View Methods
    ///

    function allowance(address owner, address spender) public view virtual override(ERC20,IERC4626) returns (uint256) {
        return super.allowance(owner,spender);
    }

    function balanceOf(address account) public view virtual override(ERC20,IERC4626) returns (uint256) {
        return super.balanceOf(account);
    }

    function name() public view virtual override(ERC20,IERC4626) returns (string memory) {
        return super.name();
    }

    function symbol() public view virtual override(ERC20,IERC4626) returns (string memory) {
        return super.symbol();
    }

    function totalSupply() public view virtual override(ERC20,IERC4626) returns (uint256) {
        return super.totalSupply();
    }

    function decimals() public view virtual override(ERC20,IERC4626) returns (uint8) {
        return getDecimals();
    }

}