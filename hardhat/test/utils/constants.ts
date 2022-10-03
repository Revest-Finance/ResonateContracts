import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { ethers } from "hardhat";
import { join } from "path";
dotenv.config({ path: ".env" });

const __basedir = join(__dirname, "../../");

console.log(`${__basedir}`);

export const ABI = {
  // The ERC-20 Contract ABI, which is a common contract interface
  // for tokens (this is the Human-Readable ABI format)
  ERC20_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/lib/ERC20.sol/ERC20.json`).toString()),
  ERC4626_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/lib/ERC4626.sol/ERC4626.json`).toString()),
  FNFTHandler_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/interfaces/IFNFTHandler.sol/IFNFTHandler.json`).toString()),
  LockManager_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/interfaces/ILockManager.sol/ILockManager.json`).toString()),
  Revest_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/interfaces/IRevest.sol/IRevest.json`).toString()),
  TokenVault_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/interfaces/ITokenVault.sol/ITokenVault.json`).toString()),
  OracleDispatch_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/interfaces/IOracleDispatch.sol/IOracleDispatch.json`).toString()),
  IAToken_ABI: JSON.parse(readFileSync(`${__basedir}/artifacts/contracts/interfaces/adapters/aavev2/IAToken.sol/IAToken.json`).toString()),
};

export const TOOLS = {
  // Run with SKIP=true npx hardhat test test/revest-primary.js to skip tests
  SKIP: process.env.SKIP || false,

  DEV_WALLET: "0xaf84f7d4061df1aafbbec39de7726d4f80beb652",

  // Whales accounts
  WHALES: {
    // staking.spec.ts
    STAKING_TESTING: [
      "0x9EB52C04e420E40846f73D09bD47Ab5e25821445",
      "0x801e08919a483ceA4C345b5f8789E506e2624ccf",
      "0xD76F585b6B94202430875aE748fF8C038Dc64111",
      "0xd9D455A8b8B9AEda2dA66c52B80c90ef423409df",
      "0x013040BCc92Ca0bec2670d61f06DA7c36678222A", // LP staker
    ],

    // revest.spec.ts
    REVEST_TESTING: [
      "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", // Holds 5 million LINK (with 18 decimals)
      "0xae2d4617c862309a3d75a0ffb358c7a5009c673f",
      "0xcffad3200574698b78f32232aa9d63eabd290703",
      "0x5754284f345afc66a98fbB0a0Afe71e0F007B949", //Tether treasury - 2.2 Billion Tether
      "0xb5d85CBf7cB3EE0D56b3bB207D5Fc4B82f43F511", // Holds a bunch of shit (Coinbase)
      "0x742d35cc6634c0532925a3b844bc454e4438f44e", //Sushi Whale and other shit
      "0x55FE002aefF02F77364de339a1292923A15844B8", //Circle USDC Whale
      "0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0", //WETH Whale
      "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE"  //Frax Whale 
    ],
  },
  TIME: {
    // Time
    HOUR: 3600,
    DAY: 3600 * 24,
    WEEK: 3600 * 24 * 7,
    MONTH: 3600 * 24 * 30,
    YEAR: 3600 * 24 * 365,
  },
  METADATA_URL: "https://ipfs.io/ipfs/",
  SEPERATOR: "\t-----------------------------------------",
  CONFIG: {
    slippage: ethers.utils.parseEther("0.005"),
    endTime: [0, 1645651488],
    amountPerPeriod: ["1.42", "1.42"].map(amt => ethers.utils.parseEther(amt)),
  },
  PATH_TO_SWAPS: [
    "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
    "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", // to WETH
  ],
  MAX_INT: ethers.constants.MaxInt256,
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
  RANDOM_ADDRESS: ["0xdd7B0d9d288e2F958c958BCd328b64812989259c", "0xa1E41F1C2F4c30e9738973D7B8E723578578dC36"],
};

export const VAULTS = {
  YEARN: {
    USDT: "0x7Da96a3891Add058AdA2E826306D812C638D87a7",
    DAI: "0xdA816459F1AB5631232FE5e97a05BBBb94970c95",
    USDC: "0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE",
    SUSHI: "0x6d765CbE5bC922694afE112C140b8878b9FB0390"
  },

  LIDO: {
    ADAPTER: "0xF9A98A9452485ed55cd3Ce5260C2b71c9807b11a"
  }
}

export const TOKEN = {
  WETH: {
    // WETH - WFTM
    1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    31337: "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
    4: "0xc778417e063141139fce010982780140aa0cd5ab",
    137: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    250: "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
    43114: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  },
  USDT: {
    // Tether
    1: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
  RVST: "0x120a3879da835A5aF037bB2d1456beBd6B54d4bA",
  LINK: "0x4e15361fd6b4bb609fa63c81a2be19d873717870", // Fantom
  AAVE_LINK: "0xa06bC25B5805d5F8d82847D191Cb4Af5A3e873E0", // AAVE Link
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  SUSHI: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
  FRAX: "0x853d955acef822db058eb8505911ed77f175b99e",
  aUSDC: "0xBcca60bB61934080951369a648Fb03DF4F96263C",
  aWETH: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
  aUSDT: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
  dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  ENS: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
  yvUSDC: "0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE",
  yvUSDT: "0x7Da96a3891Add058AdA2E826306D812C638D87a7",
  yvWETH: "0xa258C4606Ca8206D8aA700cE2143D7db854D168c",
  yvSUSHI: "0x6d765CbE5bC922694afE112C140b8878b9FB0390",
  steth: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
  daieth_slp: "0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f",
  ethens_slp: "0xa1181481bEb2dc5De0DaF2c85392d81C704BF75D"
};

export const ORACLE = {
  CHAINLINK: {
    "USDC/ETH": "0xC03bB46b3BFD42e6a2bf20aD6Fa660e4Bd3736F8"
  }
}

export const PROTOCOL = {
  REVEST: {
    REVEST_CONTRACT: {
      1: "0x9f551F75DB1c301236496A2b4F7CeCb2d1B2b242",
      31337: "0x9f551F75DB1c301236496A2b4F7CeCb2d1B2b242",
      4: "0x1A32ADf9cA56542fd3eE889ab85E4915F5c11D99",
      137: "0x53c26e1edc87027A0e921955BfF21daA7d8a783a#code",
      250: "0x9dCACC6ec1D8c86e2393Bd8A45DF208b3e4Edd2C",
      43114: "0xbe723c20cbe6b7d38bd9c460059d7d5ed256bd66",
    },
    REVEST_ADDRESS_PROVIDERS: {
      1: "0xd2c6eB7527Ab1E188638B86F2c14bbAd5A431d78",
      31337: "0xD721A90dd7e010c8C5E022cc0100c55aC78E0FC4", // No clue if the rest of these are accurate.
      4: "0x21744C9A65608645E1b39a4596C39848078C2865",
      137: "0xC03bB46b3BFD42e6a2bf20aD6Fa660e4Bd3736F8",
      250: "0xe0741aE6a8A6D87A68B7b36973d8740704Fd62B9",
      43114: "0x64e12fEA089e52A06A7A76028C809159ba4c1b1a",
    },
    REVEST_REWARDS: {
      1: "0xA4E7f2a1EDB5AD886baA09Fb258F8ACA7c934ba6",
    },
    REVEST_STAKING_VERSIONS: {
      1: "0xbCbB435cf6f664CAA5222c3Ee01d1A377F12C428",
      2: "0xA002Dc3E3C163732F4F5e6F941C87b61B5Afca74",
    },
    REVEST_FNFT_HANDLER: {
      1: "0xa07E6a51420EcfCB081917f40423D29529705e8a"
    },
    REVEST_LOCK_MANAGER: {
      1: "0x226124E83868812D3Dae87eB3C5F28047E1070B7"
    },
    REVEST_TOKEN_VAULT: {
      1: "0xD672f1E3411c23Edbb49e8EB6C6b1564b2BF8E17"
    }
  },



  // Uniswap and it's forks
  UNISWAP: {
    V2: {
      ROUTER: {
        1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        31337: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        4: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
        250: "0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52",
        43114: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106",
      },
      FACTORY: {
        1: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      },
      PAIRS: {
        RVST_WETH_PAIR: "0x6490828Bd87Be38279A36F029f3b9Af8b4E14B49",
      },
    },
  },

  SUSHISWAP: {
    ROUTER: {
      1: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
    }
  },

  MASTERCHEF: {
    V1: "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
    V2: "0xef0881ec094552b2e128cf945ef17a6752b4ec5d"
  }
};
