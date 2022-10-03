import { BigNumber, Contract, Signer } from "ethers";
import hre, { ethers } from "hardhat";
import { JsonRpcSigner } from "@ethersproject/providers";

import { IFNFTConfigStruct } from "./index";

export const setupImpersonator = async (address: string): Promise<string> => {
  await hre.network.provider.send("hardhat_impersonateAccount", [address]);
  return address;
};

export const mineBlocks = async (blockCount: number): Promise<void> => {
  for (let i = 0; i < blockCount; ++i) {
    await hre.network.provider.send("evm_mine");
  }
};

export const getBlockNumber = async (): Promise<number> => {
  const blockNumber = await hre.network.provider.send("eth_blockNumber");
  return parseInt(blockNumber.slice(2), 16);
};

export const getTimeStamp = async (): Promise<number> => {
  const blockNumber = await hre.network.provider.send("eth_blockNumber");
  const blockTimestamp = (await hre.network.provider.send("eth_getBlockByNumber", [blockNumber, false])).timestamp;
  return parseInt(blockTimestamp.slice(2), 16);
};

export const getSnapShot = async (): Promise<void> => {
  return await hre.network.provider.send("evm_snapshot");
};

export const revertEvm = async (snapshotID: any): Promise<void> => {
  await hre.network.provider.send("evm_revert", [snapshotID]);
};

export const getLatestBlockTimestamp = async (): Promise<number> => {
  const latestBlock = await ethers.provider.getBlock("latest");
  return latestBlock.timestamp;
};

export const getLatestBlockNumber = async (): Promise<number> => {
  const latestBlock = await ethers.provider.getBlock("latest");
  return latestBlock.number;
};

export const approveAll = async (
  signer: Signer | JsonRpcSigner,
  address: string,
  tokenContracts: Contract[],
): Promise<Boolean> => {
  tokenContracts.forEach(async (tokenContract: Contract) => {
    try {
      await tokenContract.connect(signer).approve(address, ethers.constants.MaxInt256);
    } catch (error: any) {
      throw new Error(error);
    }
  });
  return true;
};

export const getDefaultFnftConfig = (address: string, amount: BigNumber): IFNFTConfigStruct => {
  const config = {
    asset: address, // The token being stored
    depositAmount: amount, // How many tokens
    depositMul: ethers.BigNumber.from(0), // Deposit multiplier
    split: ethers.BigNumber.from(0), // Number of splits remaining
    maturityExtension: false, // Maturity extensions remaining
    pipeToContract: "0x0000000000000000000000000000000000000000", // Indicates if FNFT will pipe to another contract
    isStaking: false,
    isMulti: false,
    depositStopTime: ethers.BigNumber.from(0),
    whitelist: false,
    nontransferrable: false
  };
  return config;
};
