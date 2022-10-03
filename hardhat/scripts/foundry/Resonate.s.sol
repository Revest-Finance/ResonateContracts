pragma solidity >=0.8.0;


import "forge-std/Script.sol";
import "contracts/Resonate.sol";
import "contracts/AddressLockProxy.sol";
import "contracts/OutputReceiverProxy.sol";
import "contracts/ResonateHelper.sol";
import "contracts/lib/ERC20.sol";
import "contracts/interfaces/IFNFTHandler.sol";

contract ResonateDeploy is Script {
    Resonate resonate;
    ResonateHelper RH;
    ERC20 USDC = ERC20(address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48));
    ERC20 DAI = ERC20(address(0x6B175474E89094C44Da98b954EedeAC495271d0F));
    IFNFTHandler fnftHandler = IFNFTHandler(address(0xa07E6a51420EcfCB081917f40423D29529705e8a));

    function deploy() internal {
        vm.startBroadcast();
        address registry = address(0xd2c6eB7527Ab1E188638B86F2c14bbAd5A431d78);
        OutputReceiverProxy ORP = new OutputReceiverProxy(registry);
        AddressLockProxy ALP = new AddressLockProxy();
        RH = new ResonateHelper(registry);
        resonate = new Resonate(registry, address(ORP), address(ALP), address(RH));
        RH.setResonate(address(resonate));
        vm.stopBroadcast();

        console2.log("Resonate deployed to ", address(resonate));
    }
}