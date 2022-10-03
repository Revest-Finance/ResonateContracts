import { BigNumber } from "ethers";
import {
  Resonate
} from "typechain";

export interface IFNFTConfigStruct {
  asset: string;
  depositAmount: BigNumber;
  depositMul: BigNumber;
  split: BigNumber;
  maturityExtension: boolean;
  pipeToContract: string;
  isStaking: boolean;
  isMulti: boolean;
  depositStopTime: BigNumber;
  whitelist: boolean;
  nontransferrable: boolean;
}

export interface IProvider {
  1: string;
  31337: string;
  4: string;
  137: string;
  250: string;
  43114: string;
}

export interface ITestProvider {
  1: string;
  31337: string;
}

export interface ISnapshot {
  resonate: Resonate
}
