pragma solidity ^0.8.12;

import "../../mocks/RariVault.sol";
import "../../lib/ERC4626.sol";

import "../../interfaces/adapters/alchemix/alchemixTransmuter.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "../../lib/FixedPointMathLib.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../base/PermissionedAdapter.sol";

import "../../lib/curve/ICrvPool.sol";

interface WETH9 {
    function withdraw(uint amount) external;
}


contract alEthAdapter is RariVault, PermissionedAdapter { 
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    alchemixTransmuter immutable transmuter;
    address public immutable CrvPool;

    constructor(address alETH, address _transmuter, address _crvPool) RariVault(ERC20(alETH)) {
        transmuter = alchemixTransmuter(_transmuter);

        CrvPool = _crvPool;

        asset.safeApprove(_transmuter, type(uint).max);

    }

    function totalAssets() public view virtual override returns (uint) {
        uint256 claimableBalance = transmuter.getClaimableBalance(address(this)); //ETH
        uint currentDeposits = transmuter.getUnexchangedBalance(address(this)); //alETH

        if (claimableBalance != 0) {
            uint swappableAmount = ICrvPool(CrvPool).get_dy(0, 1, claimableBalance);

            return currentDeposits + swappableAmount;
        }

        else {
            return currentDeposits;
        }
    }

    function harvest() public onlyValidHarvester {
        uint256 claimableBalance = transmuter.getClaimableBalance(address(this));//ETH

        if (claimableBalance != 0) {
            transmuter.claim(claimableBalance, address(this)); //in WETH

            //Convert from WETH back to ETH - The CRV pool takes literal eth not WETH so we need to convert it first
            WETH9(WETH).withdraw(ERC20(WETH).balanceOf(address(this)));

            //Swap the ETH for alETH in the curve pool -> Revert if no discount occurs (the +1 ensures it trades at a discount to prevent sandwiches)
            ICrvPool(CrvPool).exchange{value: address(this).balance}(0, 1, address(this).balance, address(this).balance+1);
        }

        if (asset.balanceOf(address(this)) != 0) {
            uint balance = asset.balanceOf(address(this));

            transmuter.deposit(balance, address(this));
        }
    }

    function afterDeposit(uint256, uint256) internal virtual override {
        //Since harvest deposits all assets, that would include the users' deposit 
        harvest();
    }

    function beforeWithdraw(uint256 assets, uint256) internal virtual override {
        uint currBalance = asset.balanceOf(address(this));

        //If not enough assets already in adapter for some reason
        if (currBalance < assets) {
            uint currentDeposits = transmuter.getUnexchangedBalance(address(this));

            //If not enough remaining in the transmuter, compound
            if (currentDeposits < assets) {
                harvest();
            }

            //Withdraw necesarry assets back to this
            transmuter.withdraw(assets, address(this));
        }
    }

    function deposit(uint256 assets, address receiver) public virtual override onlyResonateWallets returns (uint256 shares) {
       return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public virtual override onlyResonateWallets returns (uint256 assets) {
        return super.mint(shares, receiver);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override onlyResonateWallets returns (uint256 shares) {
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override onlyResonateWallets returns (uint256 assets) {
        return super.redeem(shares, receiver, owner);
    }

    fallback() external payable {}

    receive() external payable {}

}