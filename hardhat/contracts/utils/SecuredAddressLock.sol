// SPDX-License-Identifier: GNU-GPL v3.0 or later

pragma solidity ^0.8.0;

import "../interfaces/IAddressLock.sol";
import "../interfaces/IAddressRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract SecuredAddressLock is IAddressLock, Ownable {

    IAddressRegistry public addressesProvider;

    constructor(address provider) Ownable() {
        addressesProvider = IAddressRegistry(provider);
    }

    function setAddressRegistry(address registry) external override onlyOwner {
        addressesProvider = IAddressRegistry(registry);
    }

    function getAddressRegistry() external view override returns (address) {
        return address(addressesProvider);
    }

    function createLock(uint fnftId, uint lockId, bytes memory arguments) external virtual {}


    modifier onlyLockManager() virtual {
        require(_msgSender() != address(0), "E004");
        require(_msgSender() == addressesProvider.getLockManager(), 'E074');
        _;
    }

    modifier onlyRevestController() virtual {
        require(_msgSender() != address(0), "E004");
        require(_msgSender() == addressesProvider.getRevest(), "E017");
        _;
    }

}
