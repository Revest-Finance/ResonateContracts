pragma solidity >=0.8.0;


import "forge-std/Script.sol";
import "./Resonate.s.sol";
import "contracts/mocks/RariVault.sol";
import "contracts/interfaces/IERC4626.sol";
contract Deploy_CreatePool is ResonateDeploy {
    RariVault vault;
    IERC4626 adapter;
    function run() public { 
        deploy();
        vm.startBroadcast();
        vault = new RariVault(USDC);
        adapter = IERC4626(address(vault));
        resonate.modifyVaultAdapter(address(vault), address(adapter));
        bytes32 poolId = resonate.createPool(address(USDC), address(vault), 7e18, 0, 86400, 1000, "Pool 1");
        vm.stopBroadcast();
    }
}