pragma solidity ^0.8.0;

interface IGLPManager {
    function getPrice(bool _maximize) external view returns (uint);
}