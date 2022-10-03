// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.13;

import {ERC20} from "../../lib/ERC20.sol";
import {ERC4626} from "../../lib/ERC4626.sol";

import {AaveV2ERC4626} from "./AaveV2ERC4626.sol";
import {IAaveMining} from "./external/IAaveMining.sol";
import {ILendingPool} from "./external/ILendingPool.sol";
import {ERC4626Factory} from "../base/ERC4626Factory.sol";

/// @title AaveV2ERC4626Factory
/// @author zefram.eth
/// @notice Factory for creating AaveV2ERC4626 contracts
contract AaveV2ERC4626Factory is ERC4626Factory {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    /// @notice Thrown when trying to deploy an AaveV3ERC4626 vault using an asset without an aToken
    error AaveV2ERC4626Factory__ATokenNonexistent();

    /// -----------------------------------------------------------------------
    /// Immutable params
    /// -----------------------------------------------------------------------

    /// @notice The Aave liquidity mining contract
    IAaveMining public immutable aaveMining;

    /// @notice The address that will receive the liquidity mining rewards (if any)
    address public immutable rewardRecipient;

    /// @notice The Aave LendingPool contract
    ILendingPool public immutable lendingPool;

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------

    constructor(
        IAaveMining aaveMining_,
        address rewardRecipient_,
        ILendingPool lendingPool_
    ) {
        aaveMining = aaveMining_;
        lendingPool = lendingPool_;
        rewardRecipient = rewardRecipient_;
    }

    /// -----------------------------------------------------------------------
    /// External functions
    /// -----------------------------------------------------------------------

    /// @inheritdoc ERC4626Factory
    function createERC4626(ERC20 asset)
        external
        virtual
        override
        returns (ERC4626 vault)
    {
        ILendingPool.ReserveData memory reserveData =
            lendingPool.getReserveData(address(asset));
        address aTokenAddress = reserveData.aTokenAddress;
        if (aTokenAddress == address(0)) {
            revert AaveV2ERC4626Factory__ATokenNonexistent();
        }

        vault =
        new AaveV2ERC4626{salt: bytes32(0)}(asset, ERC20(aTokenAddress), aaveMining, rewardRecipient, lendingPool);

        emit CreateERC4626(asset, vault);
    }

    /// @inheritdoc ERC4626Factory
    function computeERC4626Address(ERC20 asset)
        external
        view
        virtual
        override
        returns (ERC4626 vault)
    {
        ILendingPool.ReserveData memory reserveData =
            lendingPool.getReserveData(address(asset));
        address aTokenAddress = reserveData.aTokenAddress;

        vault = ERC4626(
            _computeCreate2Address(
                keccak256(
                    abi.encodePacked(
                        // Deployment bytecode:
                        type(AaveV2ERC4626).creationCode,
                        // Constructor arguments:
                        abi.encode(
                            asset, ERC20(aTokenAddress), aaveMining, rewardRecipient, lendingPool
                        )
                    )
                )
            )
        );
    }
}