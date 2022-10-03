pragma solidity >= 0.8.0;


import "forge-std/Test.sol";
import "contracts/lib/ERC20.sol";


contract ETHTokensTest is Test {
    ERC20 USDC = ERC20(address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48));
    ERC20 DAI = ERC20(address(0x6B175474E89094C44Da98b954EedeAC495271d0F));
    
    constructor() public {
        vm.label(address(USDC), "USDC");
        vm.label(address(DAI), "DAI");
    }
}