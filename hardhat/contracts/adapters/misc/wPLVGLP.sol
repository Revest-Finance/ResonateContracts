// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import "../../mocks/RariVault.sol";
import "../../interfaces/adapters/misc/IPlutusWrapper.sol";
import "../../lib/ERC4626.sol";

// import "forge-std/console2.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "../../lib/FixedPointMathLib.sol";


contract wPLVGLP {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    ERC20 public immutable plsGLP;
    ERC20 public immutable plvGLP;

    mapping (address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowance;

    uint public totalSupply;
    uint public decimals;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(
        address _plvGLP,
        address _plsGLP
    ) {
        
        plsGLP = ERC20(_plsGLP);
        plvGLP = ERC20(_plvGLP);
        decimals = plvGLP.decimals();
    } 

    function balanceOf(address _account) public view returns (uint256) {
        // return scaleUp(balances[_account]);
        return scaleUp(balances[_account]);//ERC4626(address(plvGLP)).convertToAssets(balances[_account]);
    }


    function mint(address to, uint256 amount) public returns (uint) {
        totalSupply += amount;

        plvGLP.safeTransferFrom(msg.sender, address(this), amount);

        // Cannot overflow because the sum of all user
        // balances can't exceed the max uint256 value.
        unchecked {
            balances[to] += amount;
        }
        return scaleUp(amount);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) public {
        require(from == msg.sender, "cannot burn shares you do not own");

        ERC4626 vault = ERC4626(address(plvGLP));

        // uint scaledUpBalance = scaleUp(balances[from]);//vault.convertToAssets(balances[from]);//
        // require(scaledUpBalance >= amount, "Amount > burnable amount of shares");

        uint scaledDownShares = scaleDown(amount);//vault.convertToShares(amount);//

        balances[from] -= scaledDownShares;

        // Cannot underflow because a user's balance
        // will never be larger than the total supply.
        unchecked {
            totalSupply -= scaledDownShares;
        }

        plvGLP.safeTransfer(msg.sender, scaledDownShares);

        emit Transfer(from, address(0), amount);
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
       
        uint scaledDownShares = scaleDown(amount);//ERC4626(address(plvGLP)).convertToShares(amount);//


        balances[msg.sender] -= scaledDownShares;

        // Cannot overflow because the sum of all user
        // balances can't exceed the max uint256 value.
        unchecked {
            balances[to] += scaledDownShares;
        }

        emit Transfer(msg.sender, to, amount);

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual returns (bool) {
        uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.

        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
       
        uint scaledDownShares = scaleDown(amount);//ERC4626(address(plvGLP)).convertToShares(amount);//

        balances[from] -= scaledDownShares;

        unchecked {
            balances[to] += scaledDownShares;
        }

        emit Transfer(from, to, amount);

        return true;
    }

    function approve(address spender, uint256 amount) public virtual returns (bool) {
        allowance[msg.sender][spender] = amount;

        emit Approval(msg.sender, spender, amount);

        return true;
    }

    function scaleUp(uint amount) public view returns (uint) {
        uint plsGLPSupply = plsGLP.totalSupply();
        uint plvGLPSupply = plvGLP.totalSupply();

        return amount.mulDivDown(plsGLPSupply, plvGLPSupply);
        // return ERC4626(address(plvGLP)).convertToAssets(amount);
    }

    function scaleDown(uint amount) public view returns (uint) {
        uint plsGLPSupply = plsGLP.totalSupply();
        uint plvGLPSupply = plvGLP.totalSupply();

        return amount.mulDivUp(plvGLPSupply, plsGLPSupply);//results in being 1 wei less.
        // return ERC4626(address(plvGLP)).convertToShares(amount);//
    }


}