pragma solidity >=0.8.10;

import "forge-std/Test.sol";


contract Demo is Test {


    function test_sol(uint128 a, uint128 b) public returns (uint256 res) {
        res = a + b;
    }

    function test_yul(uint128 a, uint128 b) public returns (uint256 res) {
        assembly {
            res := add(a, b)
        }
        assert(res == a + b);
    }
}