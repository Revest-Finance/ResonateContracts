// SPDX-License-Identifier: GNU-GPL
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

abstract contract PermissionedAdapter is AccessControl {

    bytes32 public constant HARVESTER = 'HARVESTER';
    bytes32 public constant SMART_WALLET = 'SMART_WALLET';

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(HARVESTER, msg.sender);
        _setupRole(SMART_WALLET, address(0));
    }

    modifier onlyValidHarvester {
        require(_validRecipient(), 'ER041');
        _;
    }

    modifier onlyAdmin {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _;
    }

    modifier onlyResonateWallets {
        require(hasRole(SMART_WALLET, msg.sender));
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
