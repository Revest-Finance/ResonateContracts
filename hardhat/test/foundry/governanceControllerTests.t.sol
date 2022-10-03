pragma solidity >=0.8.0;

import "./ETHResonate.t.sol";
import "contracts/utils/BytesLib.sol";
import "contracts/GovernanceController.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "forge-std/Test.sol";
import "forge-std/console2.sol";

contract governanceControllerTest is ETHResonateTest {

    address alice = address(2e9); // random
    address bob = address(2e10); // random
    address admin = address(2e8); //random

    GovernanceController govController;

    constructor() ETHResonateTest() {
        vm.label(alice, "alice");
        vm.label(bob, "bob");

        govController = new GovernanceController(admin);

        console2.log(address(ORP));

        vm.prank(ORP.owner(), ORP.owner());
        ORP.transferOwnership(address(govController));

        address newORPOwner = ORP.owner();
        assertEq(newORPOwner, address(govController));


    }

    function setUp() public {}

    function testProperPermissions() public {

        //Register permission for alice
        address[] memory targets = new address[](1);
       targets[0] = address(ORP); 

        address[] memory owners = new address[](1);
        owners[0] = alice;

        uint[] memory datas = new uint[](1);
        datas[0] = uint(0x2e3191a9);

        vm.prank(admin);
        govController.batchRegisterFunctions(targets, owners, datas);

        //verify she has permissions
        address newOwner = govController.functionOwner(address(ORP), 0x2e3191a9);
        console2.log("new owner: ", newOwner);
        console2.log("alice: ", alice);
        assertEq(newOwner, alice);

        //     function proxyCall(address target, uint value, bytes calldata data) public
        //Run the function as alice
        vm.prank(alice, alice);
        govController.functionCall(address(ORP), 0, abi.encodeWithSelector(0x2e3191a9, address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)));

        //Verify function executed successfully
        address newResonate = ORP.resonate();
        assertEq(newResonate, address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2));
    }

    function testFailProperPermissions() public {
        //Should fail because Bob does not have permissions
        vm.prank(bob, bob);
        govController.functionCall(address(ORP), 0, abi.encodeWithSelector(0x2e3191a9, address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)));
    }

}