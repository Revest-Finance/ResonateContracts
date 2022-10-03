// SPDX-License-Identifier: GNU-GPL
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract PermissionedAdapter is AccessControl {

    bytes32 public constant HARVESTER = 'HARVESTER';

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(HARVESTER, msg.sender);
    }

    modifier onlyValidHarvester() {
        require(_validRecipient(), 'ER041');
        _;
    }

    function _validRecipient() internal view returns (bool valid) {
        uint32 size;
        address sender = msg.sender;
        assembly {
            size := extcodesize(sender)
        }
        bool isEOA = size == 0;
        valid = (msg.sender == tx.origin && isEOA) || hasRole(HARVESTER, msg.sender);
    }


}
