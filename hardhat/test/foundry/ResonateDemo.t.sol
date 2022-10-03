pragma solidity >=0.8.10;

import "./ETHResonate.t.sol";
// import "contracts/adapters/yearn/ReaperWrapper.sol";

contract ResonatePlayground is Test {
    Resonate resonate = Resonate(0xe318412Ee02Dea2DC3B36882226103A58ce28F2D);
    address alice = address(1);
    address vault = 0x91155c72ea13BcbF6066dD161BECED3EB7c35e35;
    ERC20 USDC = ERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    ERC20 BOO = ERC20(0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE);

    constructor() public {
        vm.label(alice, "alice");
        vm.label(address(USDC), "USDC");
        vm.label(address(BOO), "BOO");
        vm.label(address(resonate), "resonate");
        // ReaperWrapper adapter = new ReaperWrapper(address(vault));
        // resonate.modifyVaultAdapter(vault, address(adapter));
    }

    function test() public {
        // function pools(bytes32 poolId) external view returns (address asset, address vault, uint80  rate, uint80  addInterestRate, uint32  lockupPeriod, uint256 packetSize);
        // bytes32 poolId = resonate.createPool(address(USDC), vault, 1e18 / 100, 0, 86400, 2e6, "Pool 1");
        bytes32 poolId = bytes32(0xa6f1f9e74918a9ee9bc6e400c3578161c422986d564ed192d0de4ecaaba6ae15);
        deal(address(BOO), alice, 10000e18);

        BOO.balanceOf(alice);
        startHoax(alice, alice);
        BOO.approve(address(resonate), ~uint(0));
        resonate.submitConsumer(poolId, 1e17, true); //0.1 
    }
}