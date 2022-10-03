import { ethers } from "ethers";
import { AbiCoder, ParamType } from "ethers/lib/utils";

export const solidityKeccak256 = (types: string[], values: readonly string[]): string => {
  return ethers.utils.solidityKeccak256(types, values);
};

export const encodeArguments = (abi: readonly (string | ParamType)[], args: readonly string[]): AbiCoder | string => {
  const abiCoder = ethers.utils.defaultAbiCoder;
  return abiCoder.encode(abi, args);
};
