pragma solidity >= 0.8.0;


import "forge-std/Test.sol";
import "contracts/lib/ERC20.sol";


contract FTMTokensTest is Test {
    ERC20 USDC = ERC20(address(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75));

    constructor() public {
        vm.label(address(USDC), "USDC");
    }
}