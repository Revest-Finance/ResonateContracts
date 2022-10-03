pragma solidity >= 0.8.0;

import "../lib/ERC20.sol";

contract Mock20 is ERC20 {
    constructor() ERC20("Mock20", "M20", 18) {}
}