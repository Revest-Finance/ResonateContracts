pragma solidity >=0.8.0;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import "contracts/Resonate.sol";
import "contracts/AddressLockProxy.sol";
import "contracts/OutputReceiverProxy.sol";
import "contracts/ResonateHelper.sol";
import "contracts/DevWallet.sol";
import "contracts/SmartWalletWhitelistV2.sol";
import "contracts/oracles/PriceProvider.sol";
import "contracts/interfaces/IFNFTHandler.sol";
import "contracts/DevWallet.sol";
import "contracts/lib/ERC20.sol";

contract ETHResonateTest is Test {
    Resonate resonate;
    ResonateHelper RH;
    IFNFTHandler fnftHandler = IFNFTHandler(address(0xa07E6a51420EcfCB081917f40423D29529705e8a));
    OutputReceiverProxy ORP;

    ERC20 USDC = ERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    ERC20 BOO = ERC20(0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE);
    ERC20 DAI = ERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);


    SmartWalletWhitelistV2 swwl;
    PriceProvider priceProvider;
    DevWallet devWallet;

    constructor() public {
        AddressLockProxy ALP = new AddressLockProxy();
        address registry = address(0xd2c6eB7527Ab1E188638B86F2c14bbAd5A431d78);
        ORP = new OutputReceiverProxy(registry);
        RH = new ResonateHelper(registry);
        swwl = new SmartWalletWhitelistV2(address(0));
        priceProvider = new PriceProvider();
        devWallet = new DevWallet();


        resonate = new Resonate(registry, address(ORP), address(ALP), address(RH), address(swwl), address(priceProvider), address(devWallet));
        RH.setResonate(address(resonate));
        vm.label(address(USDC), "USDC");
        vm.label(address(DAI), "DAI");
        vm.label(address(resonate), "resonate");

        console2.log(ORP.owner());

    }
}