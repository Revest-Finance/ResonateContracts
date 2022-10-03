// Run with `npx hardhat test test/revest-primary.js`
import { use } from "chai";
import { expect, assert, } from "chai";
import { step } from 'mocha-steps'
import { ethers, network } from "hardhat";
import { solidity } from "ethereum-waffle";
import { BigNumber, BytesLike, Contract, providers } from "ethers";
import { JsonRpcSigner } from "@ethersproject/providers";

import {
  ABI,
  approveAll,
  PROTOCOL,
  setupImpersonator,
  advanceTimeAndBlock,
  TOKEN,
  TOOLS,
  VAULTS,
  ORACLE,
} from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ERC20,
  Resonate,
  IFNFTHandler,
  ILockManager,
  IERC4626,
  IRevest,
  ITokenVault,
  RariVault,
  AddressLockProxy,
  OutputReceiverProxy,
  IOracleDispatch,
  MockOracleDispatch,
  ResonateHelper,
  SandwichBotProxy,
  SmartWalletWhitelistV2,
  PriceProvider
} from "typechain";
import { Address, toChecksumAddress, zeroAddress } from "ethereumjs-util";

use(solidity);

// Run with SKIP=true npx hardhat test test/revest-primary.js to skip tests
const skip = TOOLS.SKIP;
console.log(skip);

describe("", () => {
  let owner: SignerWithAddress;
  let whaleSigners: JsonRpcSigner[];
  let randomSigners: JsonRpcSigner[];

  let resonateHelperOwner: JsonRpcSigner;

  let chainlinkContract: ERC20;
  let wETHCon: ERC20;
  let usdcCon: ERC20;
  let sushiCon: ERC20;
  let fraxCon: ERC20;
  let aLINKCon: ERC20;
  let usdtCon: ERC20;
  let resonate: Resonate;
  let fnftHandler: IFNFTHandler;
  let lockManager: ILockManager
  let revest: IRevest;
  let addressLockproxy: AddressLockProxy;
  let outputreceiverProxy: OutputReceiverProxy;
  let resonateHelper: ResonateHelper;
  let sandwichBotProxy: SandwichBotProxy;
  let smartWalletWhitelist: SmartWalletWhitelistV2;
  let priceProvider: PriceProvider;
  
  let vault: ITokenVault;

  let pool_t0: BytesLike;
  let pool_t1: BytesLike;

  let mockVault: RariVault;
  let mockWethVault: RariVault;
  let sushiVault: RariVault;
  let usdtVault: RariVault;

  let wethOracle: IOracleDispatch
  let mockOracleDispatch: MockOracleDispatch

  const RVST = TOKEN.RVST;
  const WETH = TOKEN.WETH[1];
  let DEV_WALLET: string;

  const HOUR = TOOLS.TIME.HOUR;
  const DAY = TOOLS.TIME.DAY;
  const WEEK = TOOLS.TIME.WEEK;
  const MONTH = TOOLS.TIME.MONTH;
  const YEAR = TOOLS.TIME.YEAR;

  const link = TOKEN.LINK;
  const weth = TOKEN.WETH[1];
  const usdt = TOKEN.USDT[1];
  const usdc = TOKEN.USDC;
  const frax = TOKEN.FRAX;
  const sushi = TOKEN.SUSHI;
  const aLINK = TOKEN.AAVE_LINK;
  const ZERO_ADDRESS = TOOLS.ZERO_ADDRESS;
  const whales = TOOLS.WHALES.REVEST_TESTING;
  const randomAdd = TOOLS.RANDOM_ADDRESS;
  const separator = TOOLS.SEPERATOR;
  const precision = 1e18 //TODO - Modify Precision

  //Rate is represented as a PERCENT => 7 = 7% upfront payout
  const RATE = 5
  const rate = BigNumber.from(RATE).mul(BigNumber.from(precision.toString()).div(100))
  const ADDITIONAL_RATE = 1 
  const additionalRate = BigNumber.from(ADDITIONAL_RATE).mul(BigNumber.from(precision.toString()).div(100))
  const packetSize = ethers.utils.parseUnits("1000", 6)
  const confidenceInterval = ethers.utils.parseUnits(".0001", 6) // 1/10 of a cent 
  const wethConfidenceInterval = ethers.utils.parseEther(".00001")// 1/1M of an Ether

  const FEE_NUM = 95;
  const FEE_DENOM = 100;


  // ABI
  const abi = ABI.ERC20_ABI.abi;
  const fnftABI = ABI.FNFTHandler_ABI.abi;
  const lockManagerABI = ABI.LockManager_ABI.abi;
  const revestABI = ABI.Revest_ABI.abi;
  const tokenVaultABI = ABI.TokenVault_ABI.abi;

  //   function eth(val) {
  //     return ethers.utils.formatEther(val);
  //   }

  async function clearQueue(_pool: BytesLike) {
    let pool = await resonate.pools(_pool);
    let queueMarkers = await resonate.queueMarkers(_pool);

    // console.log("---Clearing Queue---")
    // console.log(`Pool: ${_pool}`)
    // console.log(`Consumer Head: ${queueMarkers.consumerHead}`)
    // console.log(`Consumer Tail: ${queueMarkers.consumerTail}`)

    //Clear the consumer queue
    //<= or just < ???
    if (!(await resonateHelper.isQueueEmpty(_pool, false))) {
      for (let x = queueMarkers.consumerHead; x.lt(queueMarkers.consumerTail); x = x.add(1)) {
          let order = await resonate.consumerQueue(_pool, x);
          let packetsRemaining = order.packetsRemaining;
          let packetSize = pool.packetSize;

          console.log(`---Packets Remaining---: ${packetsRemaining}`)

          for(let y = BigNumber.from(0); y.lt(packetsRemaining); y = y.add(1)) {

            console.log("Emptying Queue with new Producers")

            //TODO Later - Change from static 70 to based on packetSize
            await resonate.connect(whaleSigners[6]).submitProducer(_pool, ethers.utils.parseUnits("50", 6), false)

            order = await resonate.consumerQueue(_pool, x);
            console.log(`Packets Remaining After: ${order.packetsRemaining}`)
          }
      }
    }

    if (!(await resonateHelper.isQueueEmpty(_pool, true))) {
    // Clear the producer queue
    //<= or just < ???
    // console.log(`Provider Head: ${queueMarkers.providerHead}`)
    // console.log(`Provider Tail: ${queueMarkers.providerTail}`)

      for (let x = queueMarkers.providerHead; x.lt(queueMarkers.providerTail); x = x.add(1)) {
        let order = await resonate.providerQueue(_pool, x);
        let packetsRemaining = order.packetsRemaining;
        let packetSize = pool.packetSize;

        for(let y = BigNumber.from(0); y.lt(packetsRemaining); y = y.add(1)) {
          await resonate.connect(whaleSigners[6]).submitConsumer(_pool, packetSize, false)
        }
      }
    }

    // //expect the queues to be empty
    expect(await resonateHelper.isQueueEmpty(_pool, false)).to.eq(true)
    expect(await resonateHelper.isQueueEmpty(_pool, true)).to.eq(true)

  }

  function formatShares(shares: BigNumber) {
    return shares.div(ethers.constants.WeiPerEther);
  }

  async function fastForwardAndAppreciate(months: number) {
    let present = await ethers.provider.getBlockNumber();
    let presentBlock = await ethers.provider.getBlock(present);

    // console.log(`Old Timestamp: ${presentBlock.timestamp}`)

    await advanceTimeAndBlock(months * MONTH);
    let future = await ethers.provider.getBlockNumber();
    let futureBlock = await ethers.provider.getBlock(future);

    // console.log(`New Timestamp: ${futureBlock.timestamp}`)

    // assert(presentBlock.timestamp + (MONTH * months) == futureBlock.timestamp);

    let usdcWhale = ethers.provider.getSigner("0x55fe002aeff02f77364de339a1292923a15844b8")
    setupImpersonator("0x55fe002aeff02f77364de339a1292923a15844b8")

    // let prePricePerShare = (await mockVault.totalAssets()).mul(precision).div(await mockVault.totalSupply())

    await usdcCon.connect(usdcWhale).transfer(mockVault.address, ethers.utils.parseUnits("5000", 6)) //send 5000 to the vault

    // console.log(`Vault Total Assets: ${await mockVault.totalAssets()}`)

    // let afterPricePerShare = (await mockVault.totalAssets()).mul(precision).div(await mockVault.totalSupply())

    // expect(afterPricePerShare).to.be.gt(prePricePerShare);

  }


  before(async () => {
    return new Promise(async resolve => {
      // runs once before the first test in this block
      [owner] = await ethers.getSigners();

      await main();

      // The Contract object
      chainlinkContract = new ethers.Contract(link, abi, owner) as ERC20;
      wETHCon = new ethers.Contract(weth, abi, owner) as ERC20;
      usdtCon = new ethers.Contract(usdt, abi, owner) as ERC20;
      aLINKCon = new ethers.Contract(aLINK, abi, owner) as ERC20;
      sushiCon = new ethers.Contract(sushi, abi, owner) as ERC20;
      usdcCon = new ethers.Contract(usdc, abi, owner) as ERC20;
      fraxCon = new ethers.Contract(frax, abi, owner) as ERC20;

      whaleSigners = [];
      randomSigners = [];

      for (const whale of whales) {
        let signer = ethers.provider.getSigner(whale);
        whaleSigners.push(signer);
        setupImpersonator(whale);

        await approveAll(signer, resonate.address, [chainlinkContract, wETHCon, usdcCon, aLINKCon, usdtCon, sushiCon, fraxCon]);
      }

      for (const randomAddr of randomAdd) {
        let signer = ethers.provider.getSigner(randomAddr);
        randomSigners.push(signer);
        setupImpersonator(randomAddr);

        await approveAll(signer, resonate.address, [chainlinkContract, wETHCon, usdcCon, aLINKCon, usdtCon, sushiCon, fraxCon]);
      }

      resonateHelperOwner = ethers.provider.getSigner("0x2c6fd9269C28DE1cA4a3c46e7d47447eFFAAB8C1");
      await setupImpersonator("0x2c6fd9269C28DE1cA4a3c46e7d47447eFFAAB8C1");


      resolve();
    });
  });

  it("should onboard an acceptable yield farm", async () => {
    console.log(`Vault Addr: ${mockVault.address}`)
    await resonate.modifyVaultAdapter(mockVault.address, mockVault.address)

    expect(await resonate.vaultAdapters(mockVault.address)).to.eq(mockVault.address)

  });

  it("should create both types of pools", async () => {
    pool_t0 = await resonate.callStatic.createPool(usdcCon.address, mockVault.address, rate, 0, YEAR, packetSize, "pool_t0");
    await resonate.createPool(usdcCon.address, mockVault.address, rate, 0, YEAR, packetSize, "pool_t0");

    pool_t1 = await resonate.callStatic.createPool(usdcCon.address, mockVault.address, rate, additionalRate, 0, packetSize, "pool_t1");
    await resonate.createPool(usdcCon.address, mockVault.address, rate, additionalRate, 0, packetSize, "pool_t1");

    console.log(`Pool 0 ID: ${pool_t0}`)
    console.log(`Pool 1 ID: ${pool_t1}`)

    expect(pool_t0).to.not.be.null;
    expect(pool_t1).to.not.be.null;

    let poolt1 = await resonate.pools(pool_t1)

    console.log(`Pool t0: ${await resonate.pools(pool_t0)}`)
    console.log(`Pool t1: ${await resonate.pools(pool_t1)}`)

  });

  describe('Creating positions and then cancelling them in both pools', async () => {
    if (skip) {
      return;
    }

    it("should create a consumer position within both of those pools, and then cancel both", async () => {
      let depositAmount = ethers.utils.parseUnits("1000", 6)
      let preBal = await usdcCon.balanceOf(whaleSigners[6]._address)
      
      console.log(`Balance before Queueing: ${preBal}`)

      await resonate.connect(whaleSigners[6]).submitConsumer(pool_t0, depositAmount, false);
      await resonate.connect(whaleSigners[6]).submitConsumer(pool_t1, depositAmount, false);
  
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.be.closeTo(preBal.sub(depositAmount.mul(2)), confidenceInterval)
      console.log(`Balance after Queueing: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)

      console.log("balances transferred successfully")
  
      //expect the length of the queue for the pool to be 1, and whaleSigners[1] to be the first in the queue
      let queueInfo = await resonate.queueMarkers(pool_t0);
      let queueInfo2 = await resonate.queueMarkers(pool_t0);

      let queuePosition = await resonate.consumerQueue(pool_t0, (queueInfo.consumerTail.sub(queueInfo.consumerHead)))
  
      console.log(`Owner of Queue Head: ${queuePosition.owner}`)

      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t1, false)).to.eq(false);

      //TODO: Figure out way to Parse this correctly - It returns right address just not formatted well.
      // expect(ethers.utils.parseBytes32String(queuePosition.owner)).to.eq(whaleSigners[1]._address);

      //Withdraw order entirely from both pools
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t0, 1, queueInfo.consumerHead, false);
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t1, 1, queueInfo2.consumerHead, false);

      //Empty queue means head == tail
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t1, false)).to.eq(true);

      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.be.closeTo(preBal, confidenceInterval);
      console.log(`Balance after queue exit: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)

    });

    it("should create a producer position of both faming enabled/disables, and then cancel those positions", async () => {
      let depositAmount = ethers.utils.parseUnits("50", 6)
      let preBal = await usdcCon.balanceOf(whaleSigners[6]._address)
      console.log(`Balance before entering non-farming queue: ${preBal}`)

      await resonate.connect(whaleSigners[6]).submitProducer(pool_t0, depositAmount, false); //is not farming
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount))
      console.log(`Balance after Queueing: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)
    
      let preBalFarming = await usdcCon.balanceOf(whaleSigners[6]._address)
      console.log(`Balance before entering farming queue: ${preBalFarming}`)
      await resonate.connect(whaleSigners[6]).submitProducer(pool_t1, depositAmount, true); //is farming
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount.mul(2)))
      console.log(`Balance after Queueing: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)

      let queueMarkers1 = await resonate.queueMarkers(pool_t0);
      let queueMarkers2 = await resonate.queueMarkers(pool_t1);


      //TODO - Find Solution
      // expect(queuePosition1.owner).to.eq(whaleSigners[6]._address);
      // expect(queuePosition2.owner).to.eq(whaleSigners[6]._address);

      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(false);
  
      //Withdraw order entirely from both pools
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t0, 1, queueMarkers1.providerHead, true);
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t1, 1, queueMarkers2.providerHead, true);

      // console.log(await resonate.queueMarkers(pool_t0))
      // console.log(await resonate.queueMarkers(pool_t1))
  
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true);
      
      //expect full balance to be returned to the producer
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal);
    });

  })

  describe('Should match a producer to an existing consumer with partial activation of counter-party', async () => {
    if (skip) {
      return;
    }

    let principalIdP1: BigNumber
    let interestIdP1: BigNumber

    let principalIdP2: BigNumber
    let interestIdP2: BigNumber

    let consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    let producerDepositAmount = ethers.utils.parseUnits("100", 6)

    let preBalConsumer: BigNumber
    let preBalProducer: BigNumber

    step("Match parties for type-0 pool", async () => {

      preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address)
      preBalProducer = await usdcCon.balanceOf(whaleSigners[0]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP1 = await fnftHandler.getNextId()
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 20k Tokens
  
      interestIdP1 = principalIdP1.add(1)
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10k Tokens
  
      let newBalt0Consumer = await usdcCon.balanceOf(whaleSigners[1]._address);
      let newBalt0Producer = await usdcCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP1}`)
      console.log(`InterestFNFT ID: ${interestIdP1}`)
  

      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP1)).to.eq(1);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP1)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP1);
      let lock2 = await lockManager.fnftIdToLock(interestIdP1);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(1);
      expect(lock2.lockType).to.eq(1);

    })

    step("Match parties for type-1 pool", async () => {
      const preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address)
      const preBalProducer = await usdcCon.balanceOf(whaleSigners[0]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP2 = await fnftHandler.getNextId()
      interestIdP2 = principalIdP2.add(1)

      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 20k Tokens
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 10k Tokens
  
      let newBalt0Consumer = await usdcCon.balanceOf(whaleSigners[1]._address);
      let newBalt0Producer = await usdcCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP2}`)
      console.log(`InterestFNFT ID: ${interestIdP2}`)
  
      //Expect provider queue to be empty and consumer queue not
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP2)).to.eq(1);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP2)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP2);
      let lock2 = await lockManager.fnftIdToLock(interestIdP2);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(3); //Not sure if you can do this cause of how enums in solidity work but 1 = timeLock
      expect(lock2.lockType).to.eq(3); //Not sure if you can do this cause of how enums in solidity work but 1 = timeLock
    })

    step('clear the queue of any remaining orders', async () => {

      console.log(`queue info pool_t0: ${await resonate.queueMarkers(pool_t0)}`)
      console.log(`queue info pool_t1: ${await resonate.queueMarkers(pool_t1)}`)

      console.log(`--Emptying queue by filling remaining orders`)

      await clearQueue(pool_t0)
      await clearQueue(pool_t1)

      console.log(`queue info pool_t0: ${await resonate.queueMarkers(pool_t0)}`)
      console.log(`queue info pool_t1: ${await resonate.queueMarkers(pool_t1)}`)
    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let appreciationAmount = ethers.utils.parseUnits("5000", 6)

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per Share: ${await mockVault.convertToAssets(1)}`)

      //Number of packets in Pool-0 -> 2
      //Number of packets in Pool-0 -> 2

      //div by 4 cause there's two packets per pool, with each pool having 50%
      let expectedInterest = appreciationAmount.div(4)

      // console.log(`Num Packets for vault: ${await resonate.activePacketsPerVault(mockVault.address)}`)

      expect((await resonateHelper.calculateInterest(principalIdP1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(principalIdP2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(interestIdP1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestIdP2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step('withdraw the interestFNFT interest from pool-0 while principal still exists', async () => {
      let preBalDev = await usdcCon.balanceOf(DEV_WALLET)

      let preBal = await usdcCon.balanceOf(whaleSigners[0]._address)
      console.log(`Balance Before Withdrawing Interest: ${preBal}`)

      let val = await resonateHelper.calculateInterest(interestIdP1);

      console.log(`Interest Before Fees: ${val.interest}`)
      console.log(`Interest After Fees: ${val.interestAfterFee}`)

      console.log(`Total shares in circulation: ${await mockVault.totalSupply()}`)
      console.log(`Expected Shares being redeemed: ${await mockVault.previewWithdraw(val.interest)}`)

      //Withdraw Interest-FNFT from type-0 pool
      // await resonate.connect(whaleSigners[0]).claimInterest(interestIdP1);
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP1, 1);

      console.log(`Supply after redemption: ${await mockVault.totalSupply()}`)

      let afterBal = await usdcCon.balanceOf(whaleSigners[0]._address);
      console.log(`Balance After Withdrawing Interest: ${afterBal}`)

      expect(afterBal).to.be.closeTo(preBal.add(val.interestAfterFee), confidenceInterval)

      //Balance increases by 37.5 USDC, 3% of 1250 token appreciation
      let afterBalDev = await usdcCon.balanceOf(DEV_WALLET);
      expect(afterBalDev).to.be.gt(preBalDev)
      console.log(`Amount Change Dev Wallet: ${afterBalDev.sub(preBalDev)}`)
    })

    step('withdraw the interestFNFT interest from pool-1 while principal still exists', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[0]._address)  
    
      console.log(`Balance Before Withdrawing Interest: ${preBal}`)

      let val = await resonateHelper.calculateInterest(interestIdP2);

      console.log(`Total shares in circulation: ${await mockVault.totalSupply()}`)
      console.log(`Expected Shares being redeemed: ${await mockVault.previewWithdraw(val.interest)}`)

      //Withdraw Interest-FNFT from type-0 pool
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP2, 1);

      console.log(`Supply after redemption: ${await mockVault.totalSupply()}`)

      let afterBal = await usdcCon.balanceOf(whaleSigners[0]._address);
      console.log(`Balance After Withdrawing Interest: ${afterBal}`)

      expect(afterBal).to.be.closeTo(preBal.add(val.interestAfterFee), confidenceInterval)

    })

    //Withdraw's 1 packet from each pool
      // t0 = 1
      // t1 = 1
      // total packets in both vaults = 2
      // console.log(`Amount of packets at end of first test: ${await resonate.activePacketsPerVault(mockVault.address)}`)
      
  })

  describe("Should test the proxy-call functionality within the pool", async () => {
    if (skip) {
      return;
    }

    step("execute arbitrary function with no state changes and token transfers", async () => {
      const iface = new ethers.utils.Interface([
        "function balanceOf(address owner) view returns (uint)"
      ])

      const resonateOwner = ethers.provider.getSigner("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");
      setupImpersonator("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");

      console.log(await resonateHelper.SANDWICH_BOT_ADDRESS())

      await resonateHelper.whiteListFunction(BigNumber.from("0x70a08231"), true)

      let functionData = iface.encodeFunctionData("balanceOf", [await resonateHelper.getAddressForFNFT(pool_t0)]);

      console.log(`Call Data: ${functionData}`)

      await sandwichBotProxy.proxyCall(pool_t0, 
        [mockVault.address],
        [ethers.utils.parseEther("0")],
        [functionData]
      )


    })

    step("revert because arbitrary function call failed", async () => {
      const resonateOwner = ethers.provider.getSigner("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");
      setupImpersonator("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");

      await resonateHelper.whiteListFunction(BigNumber.from("0x12341234"), true)

      await expect(sandwichBotProxy.proxyCall(pool_t0, 
        [mockVault.address],
        [ethers.utils.parseEther("0")],
        ["0x12341234"]
      )).to.be.revertedWith("ER022")

    })

    step("revert because arbitrary function call made an illegal call to fallback function", async () => {
      await expect(sandwichBotProxy.proxyCall(pool_t0,  
        [mockVault.address],
        [ethers.utils.parseEther("0")],
        ["0x"]
      )).to.be.revertedWith("ER028")

    })

    step("fail to execute arbitrary function because it attempts to invoke a non-whitelisted function", async () => {

      
      const iface = new ethers.utils.Interface([
        "function approve(address spender, uint256 amount) external returns (bool)"
      ])

      let functionData = iface.encodeFunctionData("approve", [
        ZERO_ADDRESS,
        ethers.utils.parseEther("1")
      ]);

      console.log(`Call Data: ${functionData}`)

      await expect(sandwichBotProxy.proxyCall(pool_t0,  
        [mockVault.address],
        [ethers.utils.parseEther("0")],
        [functionData]
      )).to.be.revertedWith("ER025");

    })

    step("fail to execute arbitrary function because it transfers funds without returning them", async () => {
      const iface = new ethers.utils.Interface([
        "function transfer(address to, uint256 amount) public virtual override returns (bool)"
      ])

      const resonateOwner = ethers.provider.getSigner("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");
      setupImpersonator("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");

      await resonateHelper.whiteListFunction(BigNumber.from("0xa9059cbb"), true)

      let functionData = iface.encodeFunctionData("transfer", [
        ZERO_ADDRESS,
        await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      ]);

      console.log(`Call Data: ${functionData}`)

      await expect(sandwichBotProxy.proxyCall(pool_t0, 
        [mockVault.address],
        [ethers.utils.parseEther("0")],
        [functionData]
      )).to.be.revertedWith("ER019");

    })

  });

  describe("Should test the sandwich bot ability to withdraw and deposit shares again with no problems", async () => {
    if (skip) {
      return
    }

    let pool0_wallet: string
    let pool0_wallet_shares_before: BigNumber;

    const sandwichBot = ethers.provider.getSigner("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");
    setupImpersonator("0xAe120F0df055428E45b264E7794A18c54a2a3fAF");

    step("withdraw from pool", async () => {
      pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet)
      expect(pool0_wallet_shares_after).to.eq(0);
    })

    step("deposit back into the pool", async () => {
      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.eq(pool0_wallet_shares_before)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })
   
  })
  
  describe('Should match a producer to an existing consumer with full activation of counter-party and extra remaining', async () => {
    if (skip) {
      return;
    }

  //producer completely fills consumer order and has extra parts of their order left over
    let consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    let producerDepositAmount = ethers.utils.parseUnits("100", 6);

    let principalId0: BigNumber;
    let interestId0: BigNumber;

    let principalId1: BigNumber;
    let interestId1: BigNumber;

    let preBalConsumer: BigNumber

    let numShares: BigNumber;

    step('producer fills consumer order for type-0 pool', async () => {
      preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address);

      principalId0 = await fnftHandler.getNextId();
      interestId0 = principalId0.add(1)

      console.log(`Expected Principal ID: ${principalId0}`)
      console.log(`Expected Interest ID: ${interestId0}`)

      console.log(`Expected Shares for Deposit: ${await mockVault.previewDeposit(packetSize)}`)
      console.log(`Pre Bal pool: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))}`)
      console.log(`Price per one share: ${await mockVault.previewRedeem(ethers.utils.parseUnits("1", 6))}`)

      numShares = await mockVault.previewDeposit(packetSize);

      //increase packets by 1 for pool -> 2
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 10k Tokens
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 50 Tokens

      console.log(`Price per one share after new packet: ${await mockVault.previewRedeem(ethers.utils.parseUnits("1", 6))}`)
      console.log(`after Bal pool: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))}`)

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId0)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId0)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to not be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true), "Pool should not be empty").to.eq(false)

      let queueStatus = await resonate.queueMarkers(pool_t0);
      let packetsRemaining = (await resonate.providerQueue(pool_t0, queueStatus.providerHead)).packetsRemaining
      expect(packetsRemaining).to.eq(1)

    })

    step('producer fills consumer order for type-1 pool', async () => {
      principalId1 = await fnftHandler.getNextId();
      interestId1 = principalId1.add(1)

      console.log(`Expected Principal ID: ${principalId1}`)
      console.log(`Expected Interest ID: ${interestId1}`)

      //increase packets by 1 for pool -> 2
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 10k Tokens
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 20k Tokens

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId1)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId1)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to not be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "Pool should not be empty").to.eq(false)

      let queueStatus = await resonate.queueMarkers(pool_t1);
      let packetsRemaining = (await resonate.providerQueue(pool_t1, queueStatus.providerHead)).packetsRemaining
      expect(packetsRemaining).to.eq(1)
    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Interest owed: ${percentInterestOwed}`)

      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      // let amountInterestOwned = percentInterestOwed.mul(percentInterestOwed);
      // let activePackets = await resonate.activePacketsPerVault(mockVault.address)

      // console.log(`Active Packets: ${activePackets}`)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalId0));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      //Number of packets in Pool-0 -> 2
      //Number of packets in Pool-1 -> 2

      //total packets in all queues currently = 4 -> 25% interest

      //div by 6 cause there's three packets per pool, with each pool having 50%

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalId0)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalId0)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(principalId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(interestId0)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step('withdraw a principal FNFT from type-0 pool while interest FNFT still exists', async () => {
      //Withdraw Principal FNFT for type-0 pool (fnftIds[2])
      let preBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      let principalfnftVal = await vault.getFNFTCurrentValue(principalId0)

      let poolAddr = await resonateHelper.getAddressForFNFT(pool_t0)
      console.log(`Vault USDC Balance: ${await mockVault.totalAssets()}`)
      console.log(`Vault Share Balance: ${await mockVault.balanceOf(poolAddr)}`)


      await revest.connect(whaleSigners[1]).withdrawFNFT(principalId0, 1)

      let afterBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      // expect(afterBalPrincipal).to.eq(preBalPrincipal.add(principalfnftVal))//Underlying principal amount

      console.log(`Balance pre-deposit: ${preBalConsumer}`)
      console.log(`Consumer Deposit Amount: ${consumerDepositAmount}`)
      console.log(`Balance pre-withdrawal: ${preBalPrincipal}`)
      console.log(`Balance post-withdrawal: ${afterBalPrincipal}`)

      expect(afterBalPrincipal).to.eq(preBalPrincipal.add(consumerDepositAmount))
    })

    step('withdraw a principal FNFT from type-1 pool while interest FNFT still exists', async () => {
      //Withdraw Principal FNFT for type-1 pool (fnftIds[3])
      let preBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);

      await revest.connect(whaleSigners[1]).withdrawFNFT(principalId1, 1)

      let afterBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);

      expect(afterBalPrincipal).to.eq(preBalPrincipal.add(consumerDepositAmount))
      expect(afterBalPrincipal).to.eq(preBalConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)))

    })
   
  });
  
  describe("Should match a producer to an existing consumer with full activation of counter-party and no amount remaining", async () => {
    if (skip) {
      return;
    }

    const consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    const producerDepositAmount = ethers.utils.parseUnits("50", 6)

    let principalId: BigNumber;
    let interestId: BigNumber;

    let principalId2: BigNumber; 
    let interestId2: BigNumber;

    let numShares: BigNumber;

    step('clear the queue of any remaining orders', async () => {
      await clearQueue(pool_t0)
      await clearQueue(pool_t1)
    })


    step("producer fills consumer order for type-0 pool", async () => {
      principalId = await fnftHandler.getNextId();
      interestId = principalId.add(1)

      console.log(`Expected Principal ID: ${principalId}`)
      console.log(`Expected Interest ID: ${interestId}`)

      numShares = await mockVault.previewDeposit(packetSize);

      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 10k Tokens
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10k Tokens

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true), "Pool is not empty").to.eq(true)
    })

    step('producer fills consumer order for type-1 pool', async () => {
      principalId2 = await fnftHandler.getNextId();
      interestId2 = principalId2.add(1)

      console.log(`Expected Principal ID: ${principalId2}`)
      console.log(`Expected Interest ID: ${interestId2}`)

      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 10k Tokens
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 10k Tokens
  
      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId2)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId2)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist.").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "Producer queue should be empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false), "Consumer queue should be empty").to.eq(true)

    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Interest owed: ${percentInterestOwed}`)

      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      // let amountInterestOwned = percentInterestOwed.mul(percentInterestOwed);
      // let activePackets = await resonate.activePacketsPerVault(mockVault.address)

      // console.log(`Active Packets: ${activePackets}`)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalId));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalId)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalId)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

    it("should withdraw a principal FNFT from type-0 pool after interest FNFT is withdrawn", async () => {
      //Calculate Interest for fnftIds[4] (type-0) and withdraw
      let preBalInterest = await usdcCon.balanceOf(whaleSigners[0]._address)
      let interestFNFTVal = await resonateHelper.calculateInterest(interestId);
      console.log(`Interest FNFT 1: ${interestFNFTVal.interest}`)
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestId, 1);

      let bal = await usdcCon.balanceOf(whaleSigners[0]._address)
      expect(bal).to.be.closeTo(preBalInterest.add(interestFNFTVal.interestAfterFee),confidenceInterval)

  
      //Withdraw Principal FNFT for type-1 pool (fnftIds[5])
      let preBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      await revest.connect(whaleSigners[1]).withdrawFNFT(principalId, 1)
      
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.be.closeTo(preBalPrincipal.add(consumerDepositAmount),confidenceInterval)
    });

    it("should withdraw a principal FNFT from type-1 pool after interest FNFT is withdrawn", async () => {
      //Calculate Interest for fnftIds[4] (type-0) and withdraw
      let preBalInterest = await usdcCon.balanceOf(whaleSigners[0]._address)
      let interestFNFTVal = await resonateHelper.calculateInterest(interestId2);
      console.log(`Interest FNFT 1: ${interestFNFTVal.interest}`)
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestId2, 1);

      let bal = await usdcCon.balanceOf(whaleSigners[0]._address)
      expect(bal).to.be.closeTo(preBalInterest.add(interestFNFTVal.interestAfterFee),confidenceInterval)

  
      //Withdraw Principal FNFT for type-1 pool (fnftIds[5])
      let preBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      await revest.connect(whaleSigners[1]).withdrawFNFT(principalId2, 1)
      
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.be.closeTo(preBalPrincipal.add(consumerDepositAmount),confidenceInterval)
    });
   
  });

  describe("Should match a producer to an existing consumer with multi counter-party activation (overflow)", async () => {
    if (skip) {
      return;
    }

    let consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    let producerDepositAmount = ethers.utils.parseUnits("100", 6)

    let principalId1: BigNumber;
    let interestId1: BigNumber;

    let principalId2: BigNumber;
    let interestId2: BigNumber;

    let principalId3: BigNumber;
    let interestId3: BigNumber;

    let principalId4: BigNumber;
    let interestId4: BigNumber;

    step('producer fills consumer order for type-0 pool', async () => {

      principalId1 = await fnftHandler.getNextId()
      interestId1 = principalId1.add(1)

      principalId2 = interestId1.add(1)
      interestId2 = principalId2.add(1)

      console.log(`Expected Principal ID of whale1: ${principalId1}`)
      console.log(`Expected Principal ID of whale2: ${principalId2}`)
      console.log(`Expected Interest ID (1) of whale3: ${interestId1}`)
      console.log(`Expected Interest ID (2) of whale3: ${interestId2}`)

      console.log(`Deposit Amount pool t0: ${await mockVault.previewDeposit(packetSize.mul(2))}`)
      await resonate.connect(whaleSigners[0]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 1k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 1k Tokens
      await resonate.connect(whaleSigners[2]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 140 Tokens

      console.log("Passed creation")

      //Check that FNFTs have been created
      let balPrincipalFNFT1 = await fnftHandler.getBalance(whaleSigners[0]._address, principalId1)
      let balPrincipalFNFT2 = await fnftHandler.getBalance(whaleSigners[1]._address, principalId2)
      let balInterestFNFT1 = await fnftHandler.getBalance(whaleSigners[2]._address, interestId1)
      let balInterestFNFT2 = await fnftHandler.getBalance(whaleSigners[2]._address, interestId2)

      expect(balPrincipalFNFT1, "Principal NFT 1 does not exist").to.eq(1)
      expect(balPrincipalFNFT2, "Principal NFT 2 does not exist").to.eq(1)
      expect(balInterestFNFT1, "Interest NFT 1 does not exist").to.eq(1)
      expect(balInterestFNFT2, "Interest NFT 2 does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true), "producer queue is not empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t0, false), "consumer queue is not empty").to.eq(true)

    })

    step('producer fills consumer order for type-1 pool', async () => {
      principalId3 = await fnftHandler.getNextId()
      interestId3 = principalId3.add(1)

      principalId4 = interestId3.add(1)
      interestId4 = principalId4.add(1)

      console.log(`Expected Principal ID of whale1: ${principalId3}`)
      console.log(`Expected Principal ID of whale2: ${principalId4}`)
      console.log(`Expected Interest ID (1) of whale3: ${interestId3}`)
      console.log(`Expected Interest ID (2) of whale3: ${interestId4}`)

      console.log(`Deposit Preview pool t1: ${await mockVault.previewDeposit(packetSize.mul(2))}`)

      await resonate.connect(whaleSigners[0]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 10k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 10k Tokens
      await resonate.connect(whaleSigners[2]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 20k Tokens

      //Check that FNFTs have been created
      let balPrincipalFNFT1 = await fnftHandler.getBalance(whaleSigners[0]._address, principalId3)
      let balPrincipalFNFT2 = await fnftHandler.getBalance(whaleSigners[1]._address, principalId4)
      let balInterestFNFT1 = await fnftHandler.getBalance(whaleSigners[2]._address, interestId3)
      let balInterestFNFT2 = await fnftHandler.getBalance(whaleSigners[2]._address, interestId4)
      expect(balPrincipalFNFT1, "Principal NFT 1 does not exist").to.eq(1)
      expect(balPrincipalFNFT2, "Principal NFT 2 does not exist").to.eq(1)
      expect(balInterestFNFT1, "Interest NFT 1 does not exist").to.eq(1)
      expect(balInterestFNFT2, "Interest NFT 2 does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "producer queue is not empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false), "consumer queue is not empty").to.eq(true)    
    })

  });

  describe('Should match a consumer to an existing producer with partial activation of counter-party', async () => {
    if (skip) {
      return;
    }

    //Should match consumer to producer with partial activation of provider

    let principalIdP1: BigNumber
    let interestIdP1: BigNumber

    let principalIdP2: BigNumber
    let interestIdP2: BigNumber

    let consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    let producerDepositAmount = ethers.utils.parseUnits("100", 6)

    let numShares: BigNumber;

    step("Match parties for type-0 pool", async () => {

      const preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address)
      const preBalProducer = await usdcCon.balanceOf(whaleSigners[1]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP1 = await fnftHandler.getNextId();
      interestIdP1 = principalIdP1.add(1)

      numShares = await mockVault.previewDeposit(packetSize);
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 20k Tokens
  
      let newBalt0Consumer = await usdcCon.balanceOf(whaleSigners[1]._address);
      let newBalt0Producer = await usdcCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP1}`)
      console.log(`InterestFNFT ID: ${interestIdP1}`)
  
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP1)).to.eq(1);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP1)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP1);
      let lock2 = await lockManager.fnftIdToLock(interestIdP1);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(1);
      expect(lock2.lockType).to.eq(1);

    })

    step("Match parties for type-1 pool", async () => {
      const preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address)
      const preBalProducer = await usdcCon.balanceOf(whaleSigners[1]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP2 = await fnftHandler.getNextId()
      interestIdP2 = principalIdP2.add(1);

      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 10k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 20k Tokens

      let newBalt0Consumer = await usdcCon.balanceOf(whaleSigners[1]._address);
      let newBalt0Producer = await usdcCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP2}`)
      console.log(`InterestFNFT ID: ${interestIdP2}`)
  
      //Expect provider queue to be empty and consumer queue not
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP2)).to.eq(1);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP2)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP2);
      let lock2 = await lockManager.fnftIdToLock(interestIdP2);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(3);
      expect(lock2.lockType).to.eq(3);
    })

    step('clear the queue of any remaining orders', async () => {
      await clearQueue(pool_t0)
      await clearQueue(pool_t1)

      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);

      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t1, false)).to.eq(true);
    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      // console.log(`Percent of Interest owed: ${percentInterestOwed}`)

      // console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalIdP1));
      // console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      // console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      // console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalIdP1)).interest}`)
      // console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalIdP1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestIdP1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalIdP2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestIdP2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step('withdraw the interestFNFT from pool-0 while principal still exists', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[0]._address)
      let val = await resonateHelper.calculateInterest(interestIdP1);

      console.log(`Interest After Fees: ${val.interestAfterFee}`)

      //Withdraw Interest-FNFT from type-0 pool
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP1, 1);
      let afterBal = await usdcCon.balanceOf(whaleSigners[0]._address)

      console.log(`Pre-Withdrawal: ${preBal}`)
      console.log(`Post-Withdrawal: ${afterBal}`)
      expect(afterBal).to.be.closeTo(preBal.add(val.interestAfterFee),confidenceInterval)
    })

    step('withdraw the interestFNFT from pool-1 while principal still exists', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[0]._address)
      let val = await resonateHelper.calculateInterest(interestIdP2);

      //Withdraw Interest-FNFT from type-0 pool
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP2, 1);
      let afterBal = await usdcCon.balanceOf(whaleSigners[0]._address)

      expect(afterBal).to.be.closeTo(preBal.add(val.interestAfterFee),confidenceInterval)
    })

    step('withdraw the principalFNFT from pool-0 after the interestFNFT', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[1]._address)

      await revest.connect(whaleSigners[1]).withdrawFNFT(principalIdP1, 1);
      let afterBal = await usdcCon.balanceOf(whaleSigners[1]._address)

      expect(afterBal).to.eq(preBal.add(consumerDepositAmount))
    })

    step('withdraw the principalFNFT from pool-1 after the interest FNFT', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[1]._address)

      await revest.connect(whaleSigners[1]).withdrawFNFT(principalIdP2, 1);
      let afterBal = await usdcCon.balanceOf(whaleSigners[1]._address)

      expect(afterBal).to.eq(preBal.add(consumerDepositAmount))
    })

  })
  
  describe('Should match a consumer to an existing producer with full activation of counter-party and extra remaining', async () => {
    if (skip) {
      return;
    }

  //consumer completely fills producer order and has extra parts of their order left over
    let consumerDepositAmount = ethers.utils.parseUnits("2000", 6)
    let producerDepositAmount = ethers.utils.parseUnits("50", 6)

    let principalId0: BigNumber;
    let interestId0: BigNumber;

    let principalId1: BigNumber;
    let interestId1: BigNumber;

    let numShares: BigNumber;

    step('consumer fills producer order for type-0 pool', async () => {

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)
      console.log(`Total Supply: ${await mockVault.totalSupply()}`)

      principalId0 = await fnftHandler.getNextId();
      interestId0 = principalId0.add(1)

      console.log(`Expected Principal ID: ${principalId0}`)
      console.log(`Expected Interest ID: ${interestId0}`)

      numShares = await mockVault.previewDeposit(packetSize);
      console.log(`Expected Shares for pool t1: ${numShares}`)

      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 20k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 10k Tokens

      console.log(`Balance of Shares after: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))}`)

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId0)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId0)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to not be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true), "Pool should be empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t0, false), "Pool should not be empty").to.eq(false)


      let queueStatus = await resonate.queueMarkers(pool_t0);
      let packetsRemainingProducer = (await resonate.providerQueue(pool_t0, queueStatus.providerHead)).packetsRemaining
      expect(packetsRemainingProducer).to.eq(0)

      let packetsRemainingConsumer = (await resonate.consumerQueue(pool_t0, queueStatus.consumerHead)).packetsRemaining
      expect(packetsRemainingConsumer).to.eq(1)

    })

    step('consumer fills producer order for type-1 pool', async () => {
      principalId1 = await fnftHandler.getNextId();
      interestId1 = principalId1.add(1)

      console.log(`Expected Principal ID: ${principalId1}`)
      console.log(`Expected Interest ID: ${interestId1}`)

      numShares = await mockVault.previewDeposit(packetSize);
      console.log(`Expected Shares for pool t1: ${numShares}`)

      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 20k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 10k Tokens

      console.log(`Balance of Shares after: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))}`)
      
      console.log(`Total Supply after all FNFTs Minted: ${await mockVault.totalSupply()}`)

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId1)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId1)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to not be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "Pool should be empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false), "Pool should not be empty").to.eq(false)


      let queueStatus = await resonate.queueMarkers(pool_t1);
      let packetsRemainingProducer = (await resonate.providerQueue(pool_t1, queueStatus.providerHead)).packetsRemaining
      expect(packetsRemainingProducer).to.eq(0)

      let packetsRemainingConsumer = (await resonate.consumerQueue(pool_t1, queueStatus.consumerHead)).packetsRemaining
      expect(packetsRemainingConsumer).to.eq(1)
    })

    //TODO: Check locks? 

    step('clear the queue of any remaining orders', async () => {
     

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))
      expect(poolt0_bal).to.be.closeTo(poolt1_bal, confidenceInterval)

      //this is doubling
      await clearQueue(pool_t0)
      await clearQueue(pool_t1)

      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "Pool should be empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false), "Pool should not be empty").to.eq(true)
    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))


      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Interest owed: ${percentInterestOwed}`)

      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalId0));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalId0)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalId0)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId0)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

    step('withdraw a principal FNFT from type-0 pool while interest FNFT still exists', async () => {
      //Withdraw Principal FNFT for type-0 pool (fnftIds[2])
      let preBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      await revest.connect(whaleSigners[1]).withdrawFNFT(principalId0, 1)

      let afterBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      expect(afterBalPrincipal).to.eq(preBalPrincipal.add(consumerDepositAmount.div(2)))//Underlying principal amount


    })

    step('withdraw a principal FNFT from type-1 pool while interest FNFT still exists', async () => {
      //Withdraw Principal FNFT for type-1 pool (fnftIds[3])
      let preBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      await revest.connect(whaleSigners[1]).withdrawFNFT(principalId1, 1)

      let afterBalPrincipal = await usdcCon.balanceOf(whaleSigners[1]._address);
      expect(afterBalPrincipal).to.eq(preBalPrincipal.add(consumerDepositAmount.div(2)))

      //Expect active position to no longer exist
      expect(await resonate.fnftIdToIndex(principalId1)).to.eq(0)
    })
   
  });
  
  describe("Should match a consumer to an existing producer with full activation of counter-party and no amount remaining", async () => {
    if (skip) {
      return;
    }

    const consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    const producerDepositAmount = ethers.utils.parseUnits("50", 6)

    let principalId: BigNumber;
    let interestId: BigNumber;

    step("producer fills consumer order for type-0 pool", async () => {
      principalId = await fnftHandler.getNextId();
      interestId = principalId.add(1)

      console.log(`Expected Principal ID: ${principalId}`)
      console.log(`Expected Interest ID: ${interestId}`)

      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 10k Tokens

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true), "Pool is not empty").to.eq(true)
    })

    step('clear the queue of any remaining orders', async () => {
      await clearQueue(pool_t0)
      await clearQueue(pool_t1)
    })

    step('producer fills consumer order for type-1 pool', async () => {
      principalId = await fnftHandler.getNextId();
      interestId = principalId.add(1)

      console.log(`Expected Principal ID: ${principalId}`)
      console.log(`Expected Interest ID: ${interestId}`)

      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 10k Tokens
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 10k Tokens
  
      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, principalId)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[0]._address, interestId)
      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist.").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "Pool should be empty").to.eq(true)
    })

    //TODO - Check number of activated positions
    // let active = await resonate.activated(activePositions);
    // expect(active.principalId).to.eq(principalId1)

    step("Should Fail to withdraw principal FNFT for type-0 pool", async () => {
      //Just a time lock, probably don't need this test cause already covered under revest tests
      await expect(revest.connect(whaleSigners[1]).withdrawFNFT(principalId, 1)).to.be.reverted
    });
  
    step("Should Fail to withdraw principal FNFT for type-1 pool", async () => {
      await expect(revest.connect(whaleSigners[1]).withdrawFNFT(principalId, 1)).to.be.reverted
    });

  });

  describe("Should match a consumer to an existing producer with multi counter-party activation (overflow)", async () => {
    if (skip) {
      return;
    }

    //one consumer should fill several producer orders
    let producerDepositAmount = ethers.utils.parseUnits("50", 6)
    let consumerDepositAmount = ethers.utils.parseUnits("2000", 6)

    let principalId1: BigNumber;
    let interestId1: BigNumber;

    let principalId2: BigNumber;
    let interestId2: BigNumber;

    let principalId3: BigNumber;
    let interestId3: BigNumber;

    let principalId4: BigNumber;
    let interestId4: BigNumber;



    let numShares: BigNumber;

    step('producer fills consumer order for type-0 pool', async () => {
      principalId1 = await fnftHandler.getNextId()
      interestId1 = principalId1.add(1)

      principalId2 = interestId1.add(1)
      interestId2 = principalId2.add(1)

      console.log(`Expected Principal ID of whale1: ${principalId1}`)
      console.log(`Expected Principal ID of whale2: ${principalId2}`)
      console.log(`Expected Interest ID (1) of whale3: ${interestId1}`)
      console.log(`Expected Interest ID (2) of whale3: ${interestId2}`)

      numShares = await mockVault.previewDeposit(packetSize);

      console.log(`Shares to be minted: ${numShares}`)
      console.log(`Shares minted at twice the amount: ${await mockVault.previewDeposit(packetSize.mul(2))}`)
      console.log(`Balance of Shares before: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))}`)

      await resonate.connect(whaleSigners[1]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 70 Tokens
      await resonate.connect(whaleSigners[2]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 70 Tokens
      await resonate.connect(whaleSigners[0]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 2k Tokens

      console.log(`Balance of Shares after: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))}`)

      //Check that FNFTs have been created
      let balPrincipalFNFT1 = await fnftHandler.getBalance(whaleSigners[1]._address, interestId1)
      let balPrincipalFNFT2 = await fnftHandler.getBalance(whaleSigners[2]._address, interestId2)
      let balInterestFNFT1 = await fnftHandler.getBalance(whaleSigners[0]._address, principalId1)
      let balInterestFNFT2 = await fnftHandler.getBalance(whaleSigners[0]._address, principalId2)
      expect(balPrincipalFNFT1, "Principal NFT 1 does not exist").to.eq(1)
      expect(balPrincipalFNFT2, "Principal NFT 2 does not exist").to.eq(1)
      expect(balInterestFNFT1, "Interest NFT 1 does not exist").to.eq(1)
      expect(balInterestFNFT2, "Interest NFT 2 does not exist").to.eq(1)

      //Expect Producer and consumer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true), "Pool T0 is not empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t0, false), "Pool T0 is not empty").to.eq(true)

    })

    step('producer fills consumer order for type-1 pool', async () => {
      principalId3 = await fnftHandler.getNextId()
      interestId3 = principalId3.add(1)

      principalId4 = interestId3.add(1)
      interestId4 = principalId4.add(1)

      console.log(`Expected Principal ID of whale1: ${principalId3}`)
      console.log(`Expected Principal ID of whale2: ${principalId4}`)
      console.log(`Expected Interest ID (1) of whale3: ${interestId3}`)
      console.log(`Expected Interest ID (2) of whale3: ${interestId4}`)

      numShares = await mockVault.previewDeposit(packetSize);

      console.log(`Shares to be minted: ${numShares}`)
      console.log(`Shares minted at twice the amount: ${await mockVault.previewDeposit(packetSize.mul(2))}`)
      console.log(`Balance of Shares before: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))}`)

      await resonate.connect(whaleSigners[1]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 70 Tokens
      await resonate.connect(whaleSigners[2]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 70 Tokens
      await resonate.connect(whaleSigners[0]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 2k Tokens

      console.log(`Balance of Shares after: ${await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))}`)

      //Check that FNFTs have been created
      let balPrincipalFNFT1 = await fnftHandler.getBalance(whaleSigners[1]._address, interestId3)
      let balPrincipalFNFT2 = await fnftHandler.getBalance(whaleSigners[2]._address, interestId4)
      let balInterestFNFT1 = await fnftHandler.getBalance(whaleSigners[0]._address, principalId3)
      let balInterestFNFT2 = await fnftHandler.getBalance(whaleSigners[0]._address, principalId4)
      expect(balPrincipalFNFT1, "Principal NFT 1 does not exist").to.eq(1)
      expect(balPrincipalFNFT2, "Principal NFT 2 does not exist").to.eq(1)
      expect(balInterestFNFT1, "Interest NFT 1 does not exist").to.eq(1)
      expect(balInterestFNFT2, "Interest NFT 2 does not exist").to.eq(1)

      //Expect Producer and consumer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true), "Pool T0 is not empty").to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false), "Pool T0 is not empty").to.eq(true)
    })

    step('fast forward 6 months and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool t0 can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)
      console.log(`Pool t1 can Claim: ${await mockVault.previewRedeem(poolt1_bal)}`)

      console.log(`Num Shares per FNFT: ${numShares}`)
      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Int erest owed: ${percentInterestOwed*100}%`)

      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalId1));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalId1)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId3)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId3)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId4)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId4)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step('withdraw accrued value from interest-bearing fnft before end of term', async () => {

      let activeFNFT1 = await resonate.activated(await resonate.fnftIdToIndex(principalId1));
      console.log(`Shares for FNFT1: ${activeFNFT1.sharesPerPacket}`)

      let activeFNFT2 = await resonate.activated(await resonate.fnftIdToIndex(principalId2));
      console.log(`Shares for FNF2: ${activeFNFT2.sharesPerPacket}`)

      let preBal = await usdcCon.balanceOf(whaleSigners[1]._address)
      let interest = await resonateHelper.calculateInterest(interestId1); //calculated since last point of withdrawal
      console.log(`Interest ID1: ${await resonateHelper.calculateInterest(interestId1)}`)

      console.log(`Means burning x Shares: ${await mockVault.previewWithdraw(interest.interest)}`)

      await resonate.connect(whaleSigners[1]).claimInterest(interestId1, whales[1])
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.be.gt(preBal);
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.eq(preBal.add(interest.interestAfterFee))

      preBal = await usdcCon.balanceOf(whaleSigners[2]._address)
      interest = await resonateHelper.calculateInterest(interestId2); //calculated since last point of withdrawal
      console.log(`Interest ID2: ${await resonateHelper.calculateInterest(interestId2)}`)

      await resonate.connect(whaleSigners[2]).claimInterest(interestId2, whales[2])
      expect(await usdcCon.balanceOf(whaleSigners[2]._address)).to.be.gt(preBal);
      expect(await usdcCon.balanceOf(whaleSigners[2]._address)).to.eq(preBal.add(interest.interestAfterFee))

      preBal = await usdcCon.balanceOf(whaleSigners[1]._address)
      interest = await resonateHelper.calculateInterest(interestId3); //calculated since last point of withdrawal
      console.log(`Interest ID3: ${await resonateHelper.calculateInterest(interestId3)}`)

      await resonate.connect(whaleSigners[1]).claimInterest(interestId3, whales[1])
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.be.gt(preBal);
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.eq(preBal.add(interest.interestAfterFee))

      preBal = await usdcCon.balanceOf(whaleSigners[2]._address)
      interest = await resonateHelper.calculateInterest(interestId4); //calculated since last point of withdrawal
      console.log(`Interest ID4: ${await resonateHelper.calculateInterest(interestId4)}`)

      await resonate.connect(whaleSigners[2]).claimInterest(interestId4, whales[2])
      expect(await usdcCon.balanceOf(whaleSigners[2]._address)).to.be.gt(preBal);
      expect(await usdcCon.balanceOf(whaleSigners[2]._address)).to.eq(preBal.add(interest.interestAfterFee))

      activeFNFT1 = await resonate.activated(await resonate.fnftIdToIndex(principalId1));
      // console.log(`Shares for FNFT1 After: ${activeFNFT1.sharesPerPacket}`)
      
      //Need to update the num shares because it's lower now
      numShares = formatShares(activeFNFT1.sharesPerPacket);
    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

    step('fast forward 6 more months and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      console.log(`Num Shares per FNFT: ${numShares}`)
      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Interest owed: ${percentInterestOwed * 100}%`)
      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalId1));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalId1)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId3)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId3)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId4)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId4)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step("should withdraw corresponding interest FNFTs after principal FNFTs are all withdrawn", async () => {
      let interestFNFTVal = await resonateHelper.calculateInterest(interestId1);

      let preBalConsumer = await usdcCon.balanceOf(whaleSigners[0]._address)
      await revest.connect(whaleSigners[0]).withdrawFNFT(principalId1, 1)
      expect(await usdcCon.balanceOf(whaleSigners[0]._address)).to.eq(preBalConsumer.add(consumerDepositAmount.div(2)))

      let lock1 = await lockManager.fnftIdToLock(interestId1);
      console.log(`Address Lock Address: ${lock1.addressLock}`)

      await revest.connect(whaleSigners[0]).withdrawFNFT(principalId2, 1)
      expect(await usdcCon.balanceOf(whaleSigners[0]._address)).to.eq(preBalConsumer.add(consumerDepositAmount))

      let activated = await resonate.activated(await resonate.fnftIdToIndex(interestId1))
      let pool = await resonate.pools(activated.poolId)

      //type-1 overall interest rate before withdraw is possible
      let expectedLifetimeInterest = ((pool.rate.add(pool.addInterestRate)).mul(pool.packetSize))

      console.log(`Expected Lifetime Interest: ${expectedLifetimeInterest}`)
  
      expect(expectedLifetimeInterest).to.be.gt(interestFNFTVal.interest) //expected lifetime interest to be greater than currently available
      let preBalInterest = await usdcCon.balanceOf(whaleSigners[1]._address)
      await revest.connect(whaleSigners[1]).withdrawFNFT(interestId1, 1);
      expect(await usdcCon.balanceOf(whaleSigners[1]._address)).to.be.closeTo(preBalInterest.add(interestFNFTVal.interestAfterFee),confidenceInterval)

      console.log(`---Second Interest Test---`)
      let residual = await resonateHelper.calculateInterest(interestId2);

      preBalInterest = await usdcCon.balanceOf(whaleSigners[2]._address)
      await revest.connect(whaleSigners[2]).withdrawFNFT(interestId2, 1);
      console.log(`Pre Bal: ${preBalInterest}`)
      console.log(`Expected Interest After Fee: ${residual}`)
      console.log(`After Interest Bal: ${await usdcCon.balanceOf(whaleSigners[2]._address)}`)
      
      expect(await usdcCon.balanceOf(whaleSigners[2]._address)).to.be.closeTo(preBalInterest.add(residual.interestAfterFee),confidenceInterval)

      //Expect active position to no longer exist
      expect(await resonate.fnftIdToIndex(principalId1)).to.eq(0)
      expect(await resonate.fnftIdToIndex(principalId2)).to.eq(0)
      expect(await resonate.fnftIdToIndex(interestId1)).to.eq(0)
      expect(await resonate.fnftIdToIndex(interestId2)).to.eq(0)

    });
  });

  describe('Should match a producer to an existing consumer with full activation for multiple packets on each side', async () => {
    if (skip) {
      return;
    }

    let principalIdP1: BigNumber
    let interestIdP1: BigNumber

    let principalIdP2: BigNumber
    let interestIdP2: BigNumber

    let consumerDepositAmount = ethers.utils.parseUnits("5000", 6)
    let producerDepositAmount = ethers.utils.parseUnits("250", 6)

    let numShares: BigNumber;

    step("Match parties for type-0 pool", async () => {

      let preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address)
      let preBalProducer = await usdcCon.balanceOf(whaleSigners[0]._address)

      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)

      console.log(`Creating positions for type-0 pool`)
      principalIdP1 = await fnftHandler.getNextId()
      interestIdP1 = principalIdP1.add(1)

      numShares = await mockVault.previewDeposit(consumerDepositAmount);
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 20k Tokens
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10k Tokens

      let newBalt0Consumer = await usdcCon.balanceOf(whaleSigners[1]._address);
      let newBalt0Producer = await usdcCon.balanceOf(whaleSigners[0]._address);

      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)

      console.log(`PrincipalFNFT ID: ${principalIdP1}`)
      console.log(`InterestFNFT ID: ${interestIdP1}`)


      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);

      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP1)).to.eq(5);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP1)).to.eq(1);

      let lock1 = await lockManager.fnftIdToLock(principalIdP1);
      let lock2 = await lockManager.fnftIdToLock(interestIdP1);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(1);
      expect(lock2.lockType).to.eq(1);

    })

    step("Match parties for type-1 pool", async () => {
      let preBalConsumer = await usdcCon.balanceOf(whaleSigners[1]._address)
      let preBalProducer = await usdcCon.balanceOf(whaleSigners[0]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP2 = await fnftHandler.getNextId()
      await resonate.connect(whaleSigners[1]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 20k Tokens
  
      interestIdP2 = principalIdP2.add(1)
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 10k Tokens
  
      let newBalt0Consumer = await usdcCon.balanceOf(whaleSigners[1]._address);
      let newBalt0Producer = await usdcCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP2}`)
      console.log(`InterestFNFT ID: ${interestIdP2}`)
  
      //Expect provider queue to be empty and consumer queue not
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP2)).to.eq(5);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP2)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP2);
      let lock2 = await lockManager.fnftIdToLock(interestIdP2);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(3); //Not sure if you can do this cause of how enums in solidity work but 1 = timeLock
      expect(lock2.lockType).to.eq(3); //Not sure if you can do this cause of how enums in solidity work but 1 = timeLock
    })

    step('clear the queue of any remaining orders', async () => {
      await clearQueue(pool_t0)
      await clearQueue(pool_t1)
    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Interest owed: ${percentInterestOwed}`)

      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      // let amountInterestOwned = percentInterestOwed.mul(percentInterestOwed);
      // let activePackets = await resonate.activePacketsPerVault(mockVault.address)

      // console.log(`Active Packets: ${activePackets}`)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalIdP1));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      //div by 6 cause there's three packets per pool, with each pool having 50%

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalIdP1)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalIdP1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(principalIdP2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(interestIdP1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestIdP2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step('withdraw the interestFNFT interest from pool-0 while principal still exists', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[0]._address)
      console.log(`Balance Before Withdrawing Interest: ${preBal}`)

      let val = await resonateHelper.calculateInterest(interestIdP1);

      console.log(`Interest Before Fees: ${val.interest}`)
      console.log(`Interest After Fees: ${val.interestAfterFee}`)

      console.log(`Total shares in circulation: ${await mockVault.totalSupply()}`)
      console.log(`Expected Shares being redeemed: ${await mockVault.previewWithdraw(val.interest)}`)

      //Withdraw Interest-FNFT from type-0 pool
      // await resonate.connect(whaleSigners[0]).claimInterest(interestIdP1);
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP1, 1);

      console.log(`Supply after redemption: ${await mockVault.totalSupply()}`)

      let afterBal = await usdcCon.balanceOf(whaleSigners[0]._address);
      console.log(`Balance After Withdrawing Interest: ${afterBal}`)

      expect(afterBal).to.be.closeTo(preBal.add(val.interestAfterFee),confidenceInterval)

      preBal = await usdcCon.balanceOf(whaleSigners[1]._address);
      await revest.connect(whaleSigners[1]).withdrawFNFT(principalIdP1, 5);
      afterBal = await usdcCon.balanceOf(whaleSigners[1]._address)
      expect(afterBal).to.be.closeTo(preBal.add(consumerDepositAmount), confidenceInterval)

      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP1)).to.eq(0);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP1)).to.eq(0);

    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

    step('withdraw the interestFNFT interest from pool-1 while principal still exists', async () => {
      let preBal = await usdcCon.balanceOf(whaleSigners[0]._address)
      console.log(`Balance Before Withdrawing Interest: ${preBal}`)

      let val = await resonateHelper.calculateInterest(interestIdP2);

      console.log(`Interest Before Fees: ${val.interest}`)
      console.log(`Interest After Fees: ${val.interestAfterFee}`)

      console.log(`Total shares in circulation: ${await mockVault.totalSupply()}`)
      console.log(`Expected Shares being redeemed: ${await mockVault.previewWithdraw(val.interest)}`)

      //Withdraw Interest-FNFT from type-0 pool
      // await resonate.connect(whaleSigners[0]).claimInterest(interestIdP1);
      await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP2, 1);

      console.log(`Supply after redemption: ${await mockVault.totalSupply()}`)

      let afterBal = await usdcCon.balanceOf(whaleSigners[0]._address);
      console.log(`Balance After Withdrawing Interest: ${afterBal}`)

      expect(afterBal).to.be.closeTo(preBal.add(val.interestAfterFee), confidenceInterval)

      preBal = await usdcCon.balanceOf(whaleSigners[1]._address);
      await revest.connect(whaleSigners[1]).withdrawFNFT(principalIdP2, 5);
      afterBal = await usdcCon.balanceOf(whaleSigners[1]._address)
      expect(afterBal).to.be.closeTo(preBal.add(consumerDepositAmount), confidenceInterval)

      expect(await fnftHandler.getBalance(whaleSigners[1]._address, principalIdP2)).to.eq(0);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP2)).to.eq(0);

    })

    step("withdraw and re-deposit into pool", async () => {
      let pool0_wallet = await resonateHelper.getAddressForFNFT(pool_t0)
      let pool0_wallet_shares_before = await mockVault.balanceOf(pool0_wallet);
  
      console.log(`Pool 0 Shares Before: ${pool0_wallet_shares_before}`)

      console.log(`Balance of Vault: ${await usdcCon.balanceOf(mockVault.address)}`)

      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_wallet_shares_before, true)

      let pool0_usdc_bal = await usdcCon.balanceOf(pool0_wallet);

      console.log(`Balance pool 0 before Depositing: ${pool0_usdc_bal}`)
  
      await sandwichBotProxy.sandwichSnapshot(pool_t0, pool0_usdc_bal, false)
  
      let pool0_wallet_shares_after = await mockVault.balanceOf(pool0_wallet);

      console.log(`Shares pool 0 after Depositing: ${pool0_wallet_shares_after}`)

      expect(pool0_wallet_shares_after).to.be.closeTo(pool0_wallet_shares_before, confidenceInterval)
      expect(await usdcCon.balanceOf(pool0_wallet)).to.eq(0);
    })

  })

  describe("Should match producer (USDC) to a consumer (WETH) for a cross-asset pool", async () => {
    // if (skip) {
    //   return;
    // }

    let consumerDepositAmount = ethers.utils.parseEther("1")
    let producerDepositAmount = ethers.utils.parseUnits('90', 6) //TODO: Change Possibly

    let wETHpacketSize = ethers.utils.parseEther("1")

    let principalId: BigNumber;
    let interestId: BigNumber;

    let principalId2: BigNumber;
    let interestId2: BigNumber;

    step("Onboard new Vault adapter for cross-asset pool", async () => {
      await resonate.modifyVaultAdapter(mockWethVault.address, mockWethVault.address)
      expect(await resonate.vaultAdapters(mockWethVault.address)).to.eq(mockWethVault.address)

      console.log(`wETH Vault Adapter: ${await resonate.vaultAdapters(mockWethVault.address)}`)

      await resonate.modifyVaultAdapter(mockVault.address, mockVault.address)
      expect(await resonate.vaultAdapters(mockVault.address)).to.eq(mockVault.address)

      console.log(`USDC Vault Adapter: ${await resonate.vaultAdapters(mockVault.address)}`)

    })

    step("Onboard new oracle for cross-asset pool", async () => {
      //TODO - Oracle Dispatch address needs to be right
      await priceProvider.setTokenOracle(weth, mockOracleDispatch.address);
      await priceProvider.setTokenOracle(usdc, mockOracleDispatch.address);
      await priceProvider.setTokenOracle(usdt, mockOracleDispatch.address);

      await mockOracleDispatch.setPrice(weth, ethers.constants.WeiPerEther);
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseUnits('0.000555555555555555', 18));
      await mockOracleDispatch.setPrice(usdt, ethers.utils.parseUnits('0.000555555555555555', 18));

    });

    step("Create a cross-asset pools for both types using USDC to payout for interest on wETH", async () => {

      pool_t0 = await resonate.callStatic.createPool(usdcCon.address, mockWethVault.address, rate, 0, YEAR, wETHpacketSize, "ca_pool_t0");
      await resonate.createPool(usdcCon.address, mockWethVault.address, rate, 0, YEAR, wETHpacketSize, "ca_pool_t0");
  
      pool_t1 = await resonate.callStatic.createPool(usdcCon.address, mockWethVault.address, rate, additionalRate, 0, wETHpacketSize, "ca_pool_t1");
      await resonate.createPool(usdcCon.address, mockWethVault.address, rate, additionalRate, 0, wETHpacketSize, "ca_pool_t1");
  
      console.log(`Pool 0 ID: ${pool_t0}`)
      console.log(`Pool 1 ID: ${pool_t1}`)
  
      expect(pool_t0).to.not.be.null;
      expect(pool_t1).to.not.be.null;

      let pool_t0_info = await resonate.pools(pool_t0);
      let pool_t1_info = await resonate.pools(pool_t1);

      expect(pool_t0_info.asset).to.eq(usdc);
      expect(pool_t1_info.asset).to.eq(usdc);
  
    })

    step("match consumer to provider for type-0 pool", async () => {
      principalId = await fnftHandler.getNextId();
      interestId = principalId.add(1)

      let preBalusdcConsumer = await usdcCon.balanceOf(whaleSigners[7]._address);
      let preBalusdcProvider = await usdcCon.balanceOf(whaleSigners[1]._address);

      let preBalwethConsumer = await wETHCon.balanceOf(whaleSigners[7]._address)

      console.log(`Expected Principal ID: ${principalId}`)
      console.log(`Expected Interest ID: ${interestId}`)

      console.log(`WETH allowance: ${await wETHCon.allowance(whaleSigners[7]._address, resonate.address)}`)

      await resonate.connect(whaleSigners[7]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 1 wETH
      await resonate.connect(whaleSigners[1]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 120 USDC

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[7]._address, principalId)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, interestId)

      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true)

      let afterBalUSDCConsumer = await usdcCon.balanceOf(whaleSigners[7]._address)
      let afterBalUSDCProducer = await usdcCon.balanceOf(whaleSigners[1]._address)

      let afterBalwETHConsumer = await wETHCon.balanceOf(whaleSigners[7]._address)

      console.log(`Balance Diff Consumer: ${afterBalUSDCConsumer.sub(preBalusdcConsumer)}`)
      console.log(`Balance Diff Producer: ${afterBalUSDCProducer.sub(preBalusdcProvider)}`)

      //Expect USDC to have moved from provider to consumer
      expect(afterBalUSDCConsumer).to.eq(preBalusdcConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)));
      expect(afterBalUSDCProducer).to.eq(preBalusdcProvider.sub(producerDepositAmount));

      //Expect wETH balance to be lower.
      expect(afterBalwETHConsumer).to.eq(preBalwethConsumer.sub(consumerDepositAmount));

    });

    step("match consumer to provider for type-1 pool", async () => {
      principalId2 = await fnftHandler.getNextId();
      interestId2 = principalId2.add(1)

      let preBalusdcConsumer = await usdcCon.balanceOf(whaleSigners[7]._address);
      let preBalusdcProvider = await usdcCon.balanceOf(whaleSigners[1]._address);

      let preBalwethConsumer = await wETHCon.balanceOf(whaleSigners[7]._address)

      console.log(`Expected Principal ID: ${principalId2}`)
      console.log(`Expected Interest ID: ${interestId2}`)

      console.log(`WETH allowance: ${await wETHCon.allowance(whaleSigners[7]._address, resonate.address)}`)

      await resonate.connect(whaleSigners[1]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 120 USDC
      await resonate.connect(whaleSigners[7]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 1 wETH

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[7]._address, principalId2)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, interestId2)

      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true)

      let afterBalUSDCConsumer = await usdcCon.balanceOf(whaleSigners[7]._address)
      let afterBalUSDCProducer = await usdcCon.balanceOf(whaleSigners[1]._address)

      let afterBalwETHConsumer = await wETHCon.balanceOf(whaleSigners[7]._address)

      console.log(`Balance Diff Consumer: ${afterBalUSDCConsumer.sub(preBalusdcConsumer)}`)
      console.log(`Balance Diff Producer: ${afterBalUSDCProducer.sub(preBalusdcProvider)}`)

      //Expect USDC to have moved from provider to consumer
      expect(afterBalUSDCConsumer).to.eq(preBalusdcConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)));
      expect(afterBalUSDCProducer).to.eq(preBalusdcProvider.sub(producerDepositAmount));

      //Expect wETH balance to be lower.
      expect(afterBalwETHConsumer).to.eq(preBalwethConsumer.sub(consumerDepositAmount));

    })

    step("fail to withdraw from fixed-term and variable term lock because time has not passed", async () => {
      await expect(revest.connect(whaleSigners[7]).withdrawFNFT(principalId, 1)).to.be.revertedWith("E082");
      await expect(revest.connect(whaleSigners[7]).withdrawFNFT(principalId2, 1)).to.be.revertedWith("E082");
    })
    
    step("fast forward 1 year to withdrawal and appreciate", async () => {
      await fastForwardAndAppreciate(15)
   

      let wETHWhale = ethers.provider.getSigner("0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE")
      setupImpersonator("0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE")
  
      let preBal = await wETHCon.balanceOf(mockWethVault.address);

      // console.log(`Assets Before: ${await mockWethVault.totalAssets()}`)
      // console.log(`Shares Before: ${await mockWethVault.totalSupply()}`)

      await wETHCon.connect(wETHWhale).transfer(mockWethVault.address, ethers.utils.parseEther("10")) //send 5 wETH to the vault
      // console.log(`Assets After: ${await mockWethVault.totalAssets()}`)
      // console.log(`Shares After: ${await mockWethVault.totalSupply()}`)


      expect(await wETHCon.balanceOf(mockWethVault.address)).to.be.gt(preBal)
    })

    //We don't need to check the ability to withdraw from a type-0 pool because we know it works
    //If the user wants an automatic swap then they can just write an outputReceiver contract to do it for them.
    step("withdraw from time-locked type-0 pool", async () => {
      let preBalwETH = await wETHCon.balanceOf(whaleSigners[7]._address);
      let expectedInterestVal = await resonateHelper.calculateInterest(interestId) //current FNFT Interest

      await revest.connect(whaleSigners[7]).withdrawFNFT(principalId, 1);

      expect(await wETHCon.balanceOf(whaleSigners[7]._address)).to.eq(preBalwETH.add(consumerDepositAmount))
      expect(await fnftHandler.getBalance(whaleSigners[7]._address, principalId)).to.eq(0)

      //TODO - Withdraw interest from type-1 pool.
      let preBalwETHProducer = await wETHCon.balanceOf(whaleSigners[1]._address)
      
      await revest.connect(whaleSigners[1]).withdrawFNFT(interestId, 1);

      let afterBalwETHProducer = await wETHCon.balanceOf(whaleSigners[1]._address);

      console.log(`Bal Before Withdrawal: ${preBalwETHProducer}`);
      console.log(`Bal After Withdrawal: ${afterBalwETHProducer}`);

      expect(afterBalwETHProducer).to.be.closeTo(preBalwETHProducer.add(expectedInterestVal.interestAfterFee), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, interestId)).to.eq(0);
    })

    step("withdraw from address-locked type-1 pool", async () => {

      //Principal Withdraw
      let preBalwETH = await wETHCon.balanceOf(whaleSigners[7]._address);

      let expectedInterestVal = await resonateHelper.calculateInterest(interestId2) //current FNFT Interest

      console.log(`Interest ID 2: ${interestId2}`)
      console.log(`Expected Interest: ${expectedInterestVal.interest}`)

      await revest.connect(whaleSigners[7]).withdrawFNFT(principalId2, 1);

      expect(await wETHCon.balanceOf(whaleSigners[7]._address)).to.be.closeTo(preBalwETH.add(consumerDepositAmount), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[7]._address, principalId2)).to.eq(0)

      //Withdraw from interestFNFT
      // expect(expectedInterestVal).to.be.gt(depositAmount);
      let preBalwETHProducer = await wETHCon.balanceOf(whaleSigners[1]._address)

      await revest.connect(whaleSigners[1]).withdrawFNFT(interestId2, 1);

      let afterBalwETHProducer = await wETHCon.balanceOf(whaleSigners[1]._address);

      expect(afterBalwETHProducer).to.be.closeTo(preBalwETHProducer.add(expectedInterestVal.interestAfterFee), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, interestId2)).to.eq(0);
    })
  });

  describe("Should Test Exchange Rate Fluctuations while in Queue", async () => {
    if (skip) {
      return;
    }

    let consumerDepositAmount = ethers.utils.parseEther("3")
    let producerDepositAmount = ethers.utils.parseUnits('270', 6) //Should Fill 3 Packets

    let principalId: BigNumber;
    let interestId: BigNumber;

    let principalId2: BigNumber;
    let interestId2: BigNumber;
    
    step("Should Create a producer position in both pools at 1800 USDC/wETH", async () => {
      principalId = await fnftHandler.getNextId();
      interestId = principalId.add(1)

      principalId2 = interestId.add(1)
      interestId2 = principalId2.add(1)

      await resonate.connect(whaleSigners[1]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 270 USDC
      await resonate.connect(whaleSigners[1]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 270 USDC

    })

    step("Should lower exchange rate and check that consumer position cannot be completely filled", async () => {
      //Producer entered the pool with 270 USDC at an exchange rate of 1800 USDC/WETH. At 5% it should take 90-tokens for each WETH packet
      //3 WETH packets should be 90 * 3 = 270 USDC exactly.
      //This test lowers the exchange rate to 2200 USDC/WETH -> at 5% each WETH packet = 110 USDC
      //so 3 packets should mean 330 USDC from producer. Since Producer deposited 270, it fills with 220 for 2 of the 3 packets
      // but it can't fill a third packet because it only has 50-remaining and needs 110 for a packet, it takes the remaining 50-tokens
      //and sends it directly to the dev wallet.
      let devWalletBefore = await usdcCon.balanceOf(DEV_WALLET)

      //If exchange rate goes up, then you should be able to fill less of the order because its fraction of consumer Amount

      //@2200 you should need 110*3 = 330 to fill the order completely => 2200 * .05 = 110
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseUnits('0.0004545455', 18));

      console.log(`Pool Info: ${await resonate.pools(pool_t0)}`)
      console.log(`Pool Info 1: ${await resonate.pools(pool_t1)}`)

      await resonate.connect(whaleSigners[7]).submitConsumer(pool_t0, consumerDepositAmount, false); //Consumer order 3 wETH

      //Expect Producer to have filled 2 packets
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[7]._address, principalId);
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, interestId);

      expect(balPrincipalFNFT).to.eq(2);
      expect(balInterestFNFT).to.eq(1);

      //Consumer should be left in the pool for one packet
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(false)

      let remainingPackets = await resonateHelper.nextInQueue(pool_t0, false)
      expect(remainingPackets.packetsRemaining).to.eq(1)

      //Producer Queue should be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true)

      //50 should go to us
      let expectedRefundAmount = ethers.utils.parseUnits('50', 6)
      let feeOnProducer = ethers.utils.parseUnits('220',6).mul(FEE_DENOM-FEE_NUM).div(FEE_DENOM);
      expect(await usdcCon.balanceOf(DEV_WALLET)).to.be.closeTo(devWalletBefore.add(expectedRefundAmount).add(feeOnProducer), confidenceInterval)
    })

    step("Should raise exchange rate and check that consumer position is filled with remaining amount", async () => {
      //Producer entered the pool with 270 USDC at an exchange rate of 1800 USDC/WETH. At 5% it should take 90-tokens for each WETH packet
      //3 WETH packets should be 90 * 3 = 270 USDC exactly.
      //This test raises the exchange rate to 1400 USDC/WETH -> at 5% each WETH packet = 70 USDC
      //so 3 packets should mean 210 USDC from producer. Since Producer deposited 270, it fills with 210 for the 3 packets but since
      //it cant fill another packet cause the remaining 60 = (270 - 210) < 70, it refunds the additional 60 back to the dev wallet

      let devWalletBefore = await usdcCon.balanceOf(DEV_WALLET)
      let expectedRefundAmount = ethers.utils.parseUnits('60', 6)
      let feeOnProducer = ethers.utils.parseUnits('210',6).mul(FEE_DENOM-FEE_NUM).div(FEE_DENOM);

      //If exchange rate goes up, then you should be able to fill less of the order because its fraction of consumer Amount

      //@1400 you should need 70 * 3 = 210 tokens to fill 3 packets => 1400 * .05 = 70
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseUnits('0.00071428571', 18));
      
      await resonate.connect(whaleSigners[7]).submitConsumer(pool_t1, consumerDepositAmount, false); //Producer order 270 USDC

      //Expect Producer to fill all three packets
      //Expect Producer to have filled 3 packets
      let balPrincipalFNFT1 = await fnftHandler.getBalance(whaleSigners[7]._address, principalId2);
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[1]._address, interestId2);

      expect(balPrincipalFNFT1).to.eq(3);
      expect(balInterestFNFT).to.eq(1);

      //producer should have none
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false)).to.eq(true)

      //60 should go to us
      let devWalletAfter = await usdcCon.balanceOf(DEV_WALLET);
      console.log(`Dev Wallet Before: ${devWalletBefore}`)
      console.log(`Dev Wallet After: ${devWalletAfter}`)

      expect(devWalletAfter).to.be.closeTo(devWalletBefore.add(expectedRefundAmount).add(feeOnProducer), confidenceInterval)

      //Clear the queue again
      await resonate.connect(whaleSigners[1]).submitProducer(pool_t0, ethers.utils.parseUnits("70", 6), false); //Producer order 270 USDC
      // await resonate.connect(whaleSigners[7]).submitConsumer(pool_t1, ethers.utils.parseEther("3")); //Producer order 270 USDC

    })

    step("Should lower exchange rate so that entire order is dequeued when 1 packet cannot be filled anymore", async () => {
      let prebalProducer = await usdcCon.balanceOf(whaleSigners[1]._address);

      //set price back to 1800
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseUnits('0.000555555555555555', 18));

      //producer enters pool at 270 USDC which should be 3 packets

      console.log(`Balance Pool Smart Wallet Before Producer: ${await usdcCon.balanceOf(await resonateHelper.getAddressForPool(pool_t1))}`)

      console.log(`Producer deposit amount ----- ${producerDepositAmount}`)

      await resonate.connect(whaleSigners[1]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 270 USDC

      console.log(`Balance Pool Smart Wallet After Producer: ${await usdcCon.balanceOf(await resonateHelper.getAddressForPool(pool_t1))}`)

      //Set price to $6k/wETH so that 1 packet = 300 USDC. Our order can no longer fill a single packet.
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseUnits('0.000166667', 18));

      //submit the consumer and wait for dequeueing to occur
      await resonate.connect(whaleSigners[7]).submitConsumer(pool_t1, consumerDepositAmount, false); //Producer order 270 USDC

      //expect the provider queue to bt empty since it was dequeued
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true)
      expect(await resonateHelper.isQueueEmpty(pool_t1, false)).to.eq(false)

      let afterBalProducer = await usdcCon.balanceOf(whaleSigners[1]._address);
      expect(afterBalProducer).to.be.closeTo(prebalProducer, confidenceInterval);

      //clear the queue of remaining consumer orders for 3 packets at 300 USDC each
      await resonate.connect(whaleSigners[1]).submitProducer(pool_t1, ethers.utils.parseUnits("900", 6), false); //Producer order 270 USDC
    });

  });

  describe("should allow a producer in a cross-asset pool to cancel order and receive full refund", async () => {
    step("set exchange rate back to standard 1800 and ensure queue is empty", async () => {
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseUnits('0.00055555555', 18));

      let queueMarkers1 = await resonate.queueMarkers(pool_t0);
      let queueMarkers2 = await resonate.queueMarkers(pool_t1);
      console.log(`---Queue Markers before---`)
      console.log(`Queue markers pool 0: ${queueMarkers1}`)
      console.log(`Queue markers pool 1: ${queueMarkers2}`)

      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);

      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t1, false)).to.eq(true);

    })
    
    
    step("should create a producer position, non-farming, and then cancel those positions", async () => {
      let depositAmount = ethers.utils.parseUnits("90", 6)
      let preBal = await usdcCon.balanceOf(whaleSigners[6]._address)
      console.log(`Balance before entering queue: ${preBal}`)

      await resonate.connect(whaleSigners[6]).submitProducer(pool_t0, depositAmount, false);
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount))
      console.log(`Balance after Queueing: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)
    
      let preBalFarming = await usdcCon.balanceOf(whaleSigners[6]._address)
      console.log(`Balance before entering 2nd queue: ${preBalFarming}`)
      await resonate.connect(whaleSigners[6]).submitProducer(pool_t1, depositAmount, false);

      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount.mul(2)))
      console.log(`Balance after Queueing second: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)

      let queueMarkers1 = await resonate.queueMarkers(pool_t0);
      let queueMarkers2 = await resonate.queueMarkers(pool_t1);
      console.log(`---Queue Markers after---`)
      console.log(`Queue markers pool 0: ${queueMarkers1}`)
      console.log(`Queue markers pool 1: ${queueMarkers2}`)

      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(false);
  
      //Withdraw order entirely from both pools
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t0, 1, queueMarkers1.providerHead, true);
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t1, 1, queueMarkers2.providerHead, true);

      // console.log(await resonate.queueMarkers(pool_t0))
      // console.log(await resonate.queueMarkers(pool_t1))
  
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true);
      
      //expect full balance to be returned to the producer
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal);
    });

    step("should create a producer position, of multiple packets, non-farming, and then cancel some of those packets", async () => {
      let depositAmount = ethers.utils.parseUnits("180", 6) //two packets each
      let preBal = await usdcCon.balanceOf(whaleSigners[6]._address)
      console.log(`Balance before entering queue: ${preBal}`)

      await resonate.connect(whaleSigners[6]).submitProducer(pool_t0, depositAmount, false);
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount))
      console.log(`Balance after Queueing: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)
    
      let preBalFarming = await usdcCon.balanceOf(whaleSigners[6]._address)
      console.log(`Balance before entering 2nd queue: ${preBalFarming}`)
      await resonate.connect(whaleSigners[6]).submitProducer(pool_t1, depositAmount, false);

      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount.mul(2)))
      console.log(`Balance after Queueing second: ${await usdcCon.balanceOf(whaleSigners[6]._address)}`)

      let queueMarkers1 = await resonate.queueMarkers(pool_t0);
      let queueMarkers2 = await resonate.queueMarkers(pool_t1);
      console.log(`---Queue Markers after---`)
      console.log(`Queue markers pool 0: ${queueMarkers1}`)
      console.log(`Queue markers pool 1: ${queueMarkers2}`)

      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(false);
  
      //Withdraw order entirely from both pools
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t0, 1, queueMarkers1.providerHead, true);
      await resonate.connect(whaleSigners[6]).modifyExistingOrder(pool_t1, 1, queueMarkers2.providerHead, true);

      // console.log(await resonate.queueMarkers(pool_t0))
      // console.log(await resonate.queueMarkers(pool_t1))
  
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(false);
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(false);
      
      //expect partial balance to be returned to the producer - basically cancelling 2 packets worth out of the 4 (depositAmount)
      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBal.sub(depositAmount));

    });

  })

  describe("Should match producer (FRAX) to a consumer (SUSHI) for a cross-asset pool", async () => {
    if (skip) {
      return;
    }
    let consumerDepositAmount = ethers.utils.parseEther("100")
    let producerDepositAmount = ethers.utils.parseEther('7.5') //TODO: Change Possibly

    let packetSize = ethers.utils.parseEther("100")

    let exchangeRate = ethers.utils.parseEther("0.666666666666667");

    let principalId: BigNumber;
    let interestId: BigNumber;

    let principalId2: BigNumber;
    let interestId2: BigNumber;

    step("Onboard new Vault adapter for cross-asset pool", async () => {
      await resonate.modifyVaultAdapter(sushiVault.address, sushiVault.address)
      expect(await resonate.vaultAdapters(sushiVault.address)).to.eq(sushiVault.address)

      console.log(`Sushi Vault Adapter: ${await resonate.vaultAdapters(sushiVault.address)}`)

    })

    step("Onboard new oracle for cross-asset pool", async () => {
      //TODO - Oracle Dispatch address needs to be right

      console.log("ONBOARDING IS HERE");

      await priceProvider.setTokenOracle(sushi, mockOracleDispatch.address);
      await priceProvider.setTokenOracle(fraxCon.address, mockOracleDispatch.address);

      await mockOracleDispatch.setPrice(sushi, ethers.constants.WeiPerEther);
      await mockOracleDispatch.setPrice(fraxCon.address, exchangeRate);

    });

    step("Create a cross-asset pools for both types using FRAX to payout for interest on SUSHI", async () => {

      pool_t0 = await resonate.callStatic.createPool(fraxCon.address, sushiVault.address, rate, 0, YEAR, packetSize, "sushi_pool_t0");
      await resonate.createPool(fraxCon.address, sushiVault.address, rate, 0, YEAR, packetSize, "sushi_pool_t0");
  
      pool_t1 = await resonate.callStatic.createPool(fraxCon.address, sushiVault.address, rate, additionalRate, 0, packetSize, "sushi_pool_t1");
      await resonate.createPool(fraxCon.address, sushiVault.address, rate, additionalRate, 0, packetSize, "sushi_pool_t1");
  
      console.log(`Pool 0 ID: ${pool_t0}`)
      console.log(`Pool 1 ID: ${pool_t1}`)
  
      expect(pool_t0).to.not.be.null;
      expect(pool_t1).to.not.be.null;

    })

    step("match consumer to provider for type-0 pool", async () => {
      principalId = await fnftHandler.getNextId();
      interestId = principalId.add(1)

      let preBalFraxConsumer = await fraxCon.balanceOf(whaleSigners[5]._address);
      let PreBalFraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address);

      let preBalSushiConsumer = await sushiCon.balanceOf(whaleSigners[5]._address)

      let preBalDev = await sushiCon.balanceOf(DEV_WALLET)

      console.log(`Expected Principal ID: ${principalId}`)
      console.log(`Expected Interest ID: ${interestId}`)

      console.log(`SUSHI allowance: ${await sushiCon.allowance(whaleSigners[5]._address, resonate.address)}`)

      await resonate.connect(whaleSigners[8]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10 FRAX
      await resonate.connect(whaleSigners[5]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 100 SUSHI

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[5]._address, principalId)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[8]._address, interestId)

      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true)

      let afterBalFraxConsumer = await fraxCon.balanceOf(whaleSigners[5]._address)
      let afterBalFraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address)

      let afterBalSushiConsumer = await sushiCon.balanceOf(whaleSigners[5]._address)

      let afterBalDev = await sushiCon.balanceOf(DEV_WALLET);
      console.log(`Amount Change Dev Wallet: ${afterBalDev.sub(preBalDev)}`)

      console.log(`Balance Diff Consumer: ${afterBalFraxConsumer.sub(preBalFraxConsumer)}`)
      console.log(`Balance Diff Producer: ${afterBalFraxProducer.sub(PreBalFraxProducer)}`)

      //Expect USDC to have moved from provider to consumer
      expect(afterBalFraxConsumer).to.be.closeTo(preBalFraxConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)), wethConfidenceInterval);
      expect(afterBalFraxProducer).to.be.closeTo(PreBalFraxProducer.sub(producerDepositAmount),wethConfidenceInterval);

      //Expect Sushi balance to be lower.
      expect(afterBalSushiConsumer).to.eq(preBalSushiConsumer.sub(consumerDepositAmount));

    });

    step("match consumer to provider for type-1 pool", async () => {
      principalId2 = await fnftHandler.getNextId();
      interestId2 = principalId2.add(1)

      let preBalFraxConsumer = await fraxCon.balanceOf(whaleSigners[5]._address);
      let PreBalFraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address);

      let preBalSushiConsumer = await sushiCon.balanceOf(whaleSigners[5]._address)
      console.log(`Expected Principal ID: ${principalId}`)
      console.log(`Expected Interest ID: ${interestId}`)

      console.log(`Sushi allowance: ${await sushiCon.allowance(whaleSigners[5]._address, resonate.address)}`)

      await resonate.connect(whaleSigners[8]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 120 USDC
      await resonate.connect(whaleSigners[5]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 1 wETH

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[5]._address, principalId2)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[8]._address, interestId2)

      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true)

      let afterBalFraxConsumer = await fraxCon.balanceOf(whaleSigners[5]._address)
      let afterBalFraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address)

      let afterBalSushiConsumer = await sushiCon.balanceOf(whaleSigners[5]._address)

      // console.log(`Balance Diff Consumer: ${afterBalFraxConsumer.sub(preBalFraxConsumer)}`)
      // console.log(`Balance Diff Producer: ${afterBalFraxProducer.sub(PreBalFraxProducer)}`)

      //Expect frax to have moved from provider to consumer
      expect(afterBalFraxConsumer).to.be.closeTo(preBalFraxConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)),wethConfidenceInterval);
      expect(afterBalFraxProducer).to.be.closeTo(PreBalFraxProducer.sub(producerDepositAmount),wethConfidenceInterval);

      //Expect wETH balance to be lower.
      expect(afterBalSushiConsumer).to.eq(preBalSushiConsumer.sub(consumerDepositAmount));
    })

    step("fail to withdraw from fixed-term and variable term lock because time has not passed", async () => {
      await expect(revest.connect(whaleSigners[5]).withdrawFNFT(principalId, 1)).to.be.revertedWith("E082")
      await expect(revest.connect(whaleSigners[5]).withdrawFNFT(principalId2, 1)).to.be.revertedWith("E082")
    })
    
    step("fast forward 1 year to withdrawal and appreciate", async () => {
      await fastForwardAndAppreciate(15)
   
      let sushiWhale = ethers.provider.getSigner("0x5a52e96bacdabb82fd05763e25335261b270efcb")
      setupImpersonator("0x5a52e96bacdabb82fd05763e25335261b270efcb")
  
      let preBal = await sushiCon.balanceOf(sushiVault.address);
      console.log(`Pre Bal: ${preBal}`)

      await sushiCon.connect(sushiWhale).transfer(sushiVault.address, ethers.utils.parseEther("200")) //send 1000 SUSHI to the vault
      let afterBal = await sushiCon.balanceOf(sushiVault.address);
      console.log(`After Bal: ${preBal}`)

      expect(afterBal).to.be.gt(preBal)
    })

    step("withdraw from time-locked type-0 pool", async () => {
      let preBalSushi = await sushiCon.balanceOf(whaleSigners[5]._address);


      let expectedInterestVal = await resonateHelper.calculateInterest(interestId) //current FNFT Interest

      await revest.connect(whaleSigners[5]).withdrawFNFT(principalId, 1);

      expect(await sushiCon.balanceOf(whaleSigners[5]._address)).to.be.closeTo(preBalSushi.add(consumerDepositAmount), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[5]._address, principalId)).to.eq(0)

      //TODO - Withdraw interest from type-1 pool.
      let preBalSushiProducer = await sushiCon.balanceOf(whaleSigners[8]._address)
      
      await revest.connect(whaleSigners[8]).withdrawFNFT(interestId, 1);

      let afterBalSushiProducer = await sushiCon.balanceOf(whaleSigners[8]._address);

      console.log(`Bal Before Withdrawal: ${preBalSushiProducer}`);
      console.log(`Bal After Withdrawal: ${afterBalSushiProducer}`);

      expect(afterBalSushiProducer).to.be.closeTo(preBalSushiProducer.add(expectedInterestVal.interestAfterFee), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, interestId)).to.eq(0);
    })

    step("withdraw from address-locked type-1 pool", async () => {
      let preBalSushi = await sushiCon.balanceOf(whaleSigners[5]._address);

      let index = await resonate.fnftIdToIndex(interestId2)
      console.log(`Index: ${index}`)
      let active = await resonate.activated(index);
      console.log(`Active: ${active}`);

      let expectedInterestVal = await resonateHelper.calculateInterest(interestId2) //current FNFT Interest

      console.log(`Expected Interest Val: ${expectedInterestVal}`)

      await revest.connect(whaleSigners[5]).withdrawFNFT(principalId2, 1);

      expect(await sushiCon.balanceOf(whaleSigners[5]._address)).to.be.closeTo(preBalSushi.add(consumerDepositAmount), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[5]._address, principalId2)).to.eq(0)

      //TODO - Withdraw interest from type-1 pool.
      let preBalSushiProducer = await sushiCon.balanceOf(whaleSigners[8]._address)
      
      await revest.connect(whaleSigners[8]).withdrawFNFT(interestId2, 1);

      let afterBalSushiProducer = await sushiCon.balanceOf(whaleSigners[8]._address);

      console.log(`Bal Before Withdrawal: ${preBalSushiProducer}`);
      console.log(`Bal After Withdrawal: ${afterBalSushiProducer}`);

      expect(afterBalSushiProducer).to.be.closeTo(preBalSushiProducer.add(expectedInterestVal.interestAfterFee), wethConfidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[8]._address, interestId2)).to.eq(0);
    })

  });

  describe("Testing regular functionality with USDT that has non-standard implementation", async () => {
    if (skip) {
      return;
    }

    let principalIdP1: BigNumber
    let interestIdP1: BigNumber

    let principalIdP2: BigNumber
    let interestIdP2: BigNumber

    let consumerDepositAmount = packetSize
    let producerDepositAmount = ethers.utils.parseUnits("50", 6)

    let preBalConsumer: BigNumber
    let preBalProducer: BigNumber

    step("should onboard an acceptable yield farm", async () => {
      console.log(`Vault Addr: ${usdtVault.address}`)
      await resonate.modifyVaultAdapter(usdtVault.address, usdtVault.address)
  
      expect(await resonate.vaultAdapters(usdtVault.address)).to.eq(usdtVault.address)
  
    });
  
    step("should create both types of pools", async () => {
      pool_t0 = await resonate.callStatic.createPool(usdtCon.address, usdtVault.address, rate, 0, YEAR, packetSize, "usdt_pool_t0");
      await resonate.createPool(usdtCon.address, usdtVault.address, rate, 0, YEAR, packetSize, "usdt_pool_t0");
  
      pool_t1 = await resonate.callStatic.createPool(usdtCon.address, usdtVault.address, rate, additionalRate, 0, packetSize, "usdt_pool_t1");
      await resonate.createPool(usdtCon.address, usdtVault.address, rate, additionalRate, 0, packetSize, "usdt_pool_t1");
  
      console.log(`Pool 0 ID: ${pool_t0}`)
      console.log(`Pool 1 ID: ${pool_t1}`)
  
      expect(pool_t0).to.not.be.null;
      expect(pool_t1).to.not.be.null;
  
      let poolt1 = await resonate.pools(pool_t1)
  
      console.log(`Pool t0: ${await resonate.pools(pool_t0)}`)
      console.log(`Pool t1: ${poolt1.asset}`)
  
    });


    step("Match parties for type-0 pool", async () => {

      preBalConsumer = await usdtCon.balanceOf(whaleSigners[3]._address)
      preBalProducer = await usdtCon.balanceOf(whaleSigners[0]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP1 = await fnftHandler.getNextId()
      await resonate.connect(whaleSigners[3]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 20k Tokens
  
      interestIdP1 = principalIdP1.add(1)
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 10k Tokens
  
      let newBalt0Consumer = await usdtCon.balanceOf(whaleSigners[3]._address);
      let newBalt0Producer = await usdtCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP1}`)
      console.log(`InterestFNFT ID: ${interestIdP1}`)
  

      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[3]._address, principalIdP1)).to.eq(1);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP1)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP1);
      let lock2 = await lockManager.fnftIdToLock(interestIdP1);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(1);
      expect(lock2.lockType).to.eq(1);

    })

    step("Match parties for type-1 pool", async () => {
      const preBalConsumer = await usdtCon.balanceOf(whaleSigners[3]._address)
      const preBalProducer = await usdtCon.balanceOf(whaleSigners[0]._address)
  
      console.log(`Pre-Balance Consumer: ${preBalConsumer}`)
      console.log(`Pre-Balance Producer: ${preBalProducer}`)
  
      console.log(`Creating positions for type-0 pool`)
      principalIdP2 = await fnftHandler.getNextId()
      await resonate.connect(whaleSigners[3]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 20k Tokens
  
      interestIdP2 = principalIdP2.add(1)
      await resonate.connect(whaleSigners[0]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 10k Tokens
  
      let newBalt0Consumer = await usdtCon.balanceOf(whaleSigners[3]._address);
      let newBalt0Producer = await usdtCon.balanceOf(whaleSigners[0]._address);
  
      console.log(`New Balance Consumer: ${newBalt0Consumer}`)
      console.log(`New Balance Producer: ${newBalt0Producer}`)
  
      console.log(`PrincipalFNFT ID: ${principalIdP2}`)
      console.log(`InterestFNFT ID: ${interestIdP2}`)
  
      //Expect both queues to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t0, false)).to.eq(true);
      expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true);
  
      //Expect the time locked FNFT's to have minted to their account
      expect(await fnftHandler.getBalance(whaleSigners[3]._address, principalIdP2)).to.eq(1);
      expect(await fnftHandler.getBalance(whaleSigners[0]._address, interestIdP2)).to.eq(1);
  
      let lock1 = await lockManager.fnftIdToLock(principalIdP2);
      let lock2 = await lockManager.fnftIdToLock(interestIdP2);
      
      //Expect the lock type to be time-locked based on type-0 pool
      expect(lock1.lockType).to.eq(3); //Not sure if you can do this cause of how enums in solidity work but 1 = timeLock
      expect(lock2.lockType).to.eq(3); //Not sure if you can do this cause of how enums in solidity work but 1 = timeLock
    })

    step('fast forward 1 year and simulate vault appreciation', async () => {
      await fastForwardAndAppreciate(15)

      //TODO - Appreciate Vautl
      await usdtCon.connect(whaleSigners[5]).transfer(usdtVault.address, ethers.utils.parseUnits("5000", 6));

    })
    
    step('withdraw a principal FNFT from type-0 pool while interest FNFT still exists', async () => {
      //Withdraw Principal FNFT for type-1 pool (fnftIds[3])
      let preBalPrincipal = await usdtCon.balanceOf(whaleSigners[3]._address);
      await revest.connect(whaleSigners[3]).withdrawFNFT(principalIdP1, 1)

      let afterBalPrincipal = await usdtCon.balanceOf(whaleSigners[3]._address);
      expect(afterBalPrincipal).to.be.closeTo(preBalPrincipal.add(consumerDepositAmount), confidenceInterval)

      //Expect active position to no longer exist
      expect(await resonate.fnftIdToIndex(principalIdP1)).to.eq(0)
    })


    step('withdraw a principal FNFT from type-1 pool while interest FNFT still exists', async () => {
      //Withdraw Principal FNFT for type-1 pool (fnftIds[3])
      let preBalPrincipal = await usdtCon.balanceOf(whaleSigners[3]._address);
      await revest.connect(whaleSigners[3]).withdrawFNFT(principalIdP2, 1)

      let afterBalPrincipal = await usdtCon.balanceOf(whaleSigners[3]._address);
      expect(afterBalPrincipal).to.be.closeTo(preBalPrincipal.add(consumerDepositAmount), confidenceInterval)

      //Expect active position to no longer exist
      expect(await resonate.fnftIdToIndex(principalIdP2)).to.eq(0)
    })

    step('withdraw an interest FNFT from type-0 pool after principal FNFT has been withdrawn', async () => {
       //Calculate Interest for fnftIds[4] (type-0) and withdraw
       let preBalInterest = await usdtCon.balanceOf(whaleSigners[0]._address)
       let interestFNFTVal = await resonateHelper.calculateInterest(interestIdP1);
       await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP1, 1);
 
       let bal = await usdtCon.balanceOf(whaleSigners[0]._address)
       expect(bal).to.be.closeTo(preBalInterest.add(interestFNFTVal.interestAfterFee), confidenceInterval)
    })

    step('withdraw an interest FNFT from type-1 pool after principal FNFT has been withdrawn', async () => {
        //Calculate Interest for fnftIds[4] (type-0) and withdraw
        let preBalInterest = await usdtCon.balanceOf(whaleSigners[0]._address)
        let interestFNFTVal = await resonateHelper.calculateInterest(interestIdP2);
        await revest.connect(whaleSigners[0]).withdrawFNFT(interestIdP2, 1);
  
        let bal = await usdtCon.balanceOf(whaleSigners[0]._address)
        expect(bal).to.be.closeTo(preBalInterest.add(interestFNFTVal.interestAfterFee), confidenceInterval)
    })

  });

  describe("Should match producer (FRAX) to a consumer (USDC) for a cross-asset pool", async () => {
    if (skip) {
      return;
    }

    let consumerDepositAmount = ethers.utils.parseUnits("1000", 6)
    let producerDepositAmount = ethers.utils.parseEther("50") //TODO: Change Possibly

    let packetSize = ethers.utils.parseUnits("1000", 6)
   
    let principalId1: BigNumber;
    let interestId1: BigNumber;

    let principalId2: BigNumber;
    let interestId2: BigNumber;

    let numShares: BigNumber;

    step("Onboard new oracle for cross-asset pool", async () => {
      //TODO - Oracle Dispatch address needs to be right
      await mockOracleDispatch.setPrice(usdcCon.address, ethers.utils.parseEther("1")); //Exchange rate 1 FRAX = 1 USDC
      await mockOracleDispatch.setPrice(frax, ethers.utils.parseEther("1"));
      
    });

    step("Create a cross-asset pools for both types using FRAX to payout for interest on USDC", async () => {

      pool_t0 = await resonate.callStatic.createPool(fraxCon.address, mockVault.address, rate, 0, YEAR, packetSize, "usdc-frax-p0");
      await resonate.createPool(fraxCon.address, mockVault.address, rate, 0, YEAR, packetSize, "usdc-frax-p0");
  
      pool_t1 = await resonate.callStatic.createPool(fraxCon.address, mockVault.address, rate, additionalRate, 0, packetSize, "usdc-frax-p1");
      await resonate.createPool(fraxCon.address, mockVault.address, rate, additionalRate, 0, packetSize, "usdc-frax-p1");
  
      console.log(`Pool 0 ID: ${pool_t0}`)
      console.log(`Pool 1 ID: ${pool_t1}`)
  
      expect(pool_t0).to.not.be.null;
      expect(pool_t1).to.not.be.null;

    })

    step("match consumer to provider for type-0 pool", async () => {
      principalId1 = await fnftHandler.getNextId();
      interestId1 = principalId1.add(1)

      let preBalfraxConsumer = await fraxCon.balanceOf(whaleSigners[6]._address);
      let PreBalfraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address);

      let preBalUSDCConsumer = await usdcCon.balanceOf(whaleSigners[6]._address)
      
      console.log(`Pre Bal USDC Consumer: ${preBalfraxConsumer}`)


      console.log(`Expected Principal ID: ${principalId1}`)
      console.log(`Expected Interest ID: ${interestId1}`)

      console.log(`USDC allowance: ${await usdcCon.allowance(whaleSigners[8]._address, resonate.address)}`)

      console.log(`Frax Decimals: ${await fraxCon.decimals()}`)
      console.log(`USDC Decimals: ${await usdcCon.decimals()}`)

      console.log(`Num Shares in vault: ${await mockVault.totalSupply()}`)
      console.log(`Num Tokens in vault: ${await mockVault.totalAssets()}`)

      numShares = await mockVault.previewDeposit(packetSize);
      console.log(`Expected Shares pool1: ${await mockVault.previewDeposit(packetSize)}`)


      await resonate.connect(whaleSigners[8]).submitProducer(pool_t0, producerDepositAmount, false); //Producer order 5 USDC
      await resonate.connect(whaleSigners[6]).submitConsumer(pool_t0, consumerDepositAmount, false); //consumer order 100 USDC

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[6]._address, principalId1)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[8]._address, interestId1)

      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
     // expect(await resonateHelper.isQueueEmpty(pool_t0, true)).to.eq(true)

      let afterBalFraxConsumer = await fraxCon.balanceOf(whaleSigners[6]._address)
      let afterBalFraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address)

      let afterBalUSDCConsumer = await usdcCon.balanceOf(whaleSigners[6]._address)

      console.log(`After`)


      console.log(`Balance Diff Consumer: ${afterBalFraxConsumer.sub(preBalfraxConsumer)}`)
      console.log(`Balance Diff Producer: ${afterBalFraxProducer.sub(PreBalfraxProducer)}`)

      //Expect FRAX to have moved from provider to consumer
      expect(afterBalFraxConsumer).to.eq(preBalfraxConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)));
      expect(afterBalFraxProducer).to.eq(PreBalfraxProducer.sub(producerDepositAmount));

      //Expect USDC balance to be lower.
      expect(afterBalUSDCConsumer).to.eq(preBalUSDCConsumer.sub(consumerDepositAmount));

    });

    step("match consumer to provider for type-1 pool", async () => {
      principalId2 = await fnftHandler.getNextId();
      interestId2 = principalId2.add(1)

      let preBalfraxConsumer = await fraxCon.balanceOf(whaleSigners[6]._address);
      let PreBalfraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address);

      let preBalUSDCConsumer = await usdcCon.balanceOf(whaleSigners[6]._address)
      
      console.log(`Pre Bal USDC Consumer: ${preBalfraxConsumer}`)

      let preBalDev = await usdcCon.balanceOf(DEV_WALLET)

      console.log(`Expected Principal ID: ${principalId1}`)
      console.log(`Expected Interest ID: ${interestId1}`)

      console.log(`USDC allowance: ${await usdcCon.allowance(whaleSigners[8]._address, resonate.address)}`)

      console.log(`Frax Decimals: ${await fraxCon.decimals()}`)
      console.log(`USDC Decimals: ${await usdcCon.decimals()}`)

      // numShares = await mockVault.previewDeposit(packetSize);
      console.log(`Expected Shares pool1: ${await mockVault.previewDeposit(packetSize)}`)

      await resonate.connect(whaleSigners[8]).submitProducer(pool_t1, producerDepositAmount, false); //Producer order 5 USDC
      await resonate.connect(whaleSigners[6]).submitConsumer(pool_t1, consumerDepositAmount, false); //consumer order 100 USDC

      //Check that FNFTs have been created
      let balPrincipalFNFT = await fnftHandler.getBalance(whaleSigners[6]._address, principalId2)
      let balInterestFNFT = await fnftHandler.getBalance(whaleSigners[8]._address, interestId2)

      expect(balPrincipalFNFT, "Principal NFT does not exist").to.eq(1)
      expect(balInterestFNFT, "Interest NFT does not exist").to.eq(1)

      //Expect Producer Queue to be empty
      expect(await resonateHelper.isQueueEmpty(pool_t1, true)).to.eq(true)

      let afterBalFraxConsumer = await fraxCon.balanceOf(whaleSigners[6]._address)
      let afterBalFraxProducer = await fraxCon.balanceOf(whaleSigners[8]._address)

      let afterBalUSDCConsumer = await usdcCon.balanceOf(whaleSigners[6]._address)

      console.log(`After`)

      let afterBalDev = await usdcCon.balanceOf(DEV_WALLET);
      console.log(`Amount Change Dev Wallet: ${afterBalDev.sub(preBalDev)}`)

      console.log(`Balance Diff Consumer: ${afterBalFraxConsumer.sub(preBalfraxConsumer)}`)
      console.log(`Balance Diff Producer: ${afterBalFraxProducer.sub(PreBalfraxProducer)}`)

      //Expect FRAX to have moved from provider to consumer
      expect(afterBalFraxConsumer).to.eq(preBalfraxConsumer.add(producerDepositAmount.mul(FEE_NUM).div(FEE_DENOM)));
      expect(afterBalFraxProducer).to.eq(PreBalfraxProducer.sub(producerDepositAmount));

      //Expect USDC balance to be lower.
      expect(afterBalUSDCConsumer).to.eq(preBalUSDCConsumer.sub(consumerDepositAmount));
    })

    step("fail to withdraw from fixed-term and variable term lock because time has not passed", async () => {
      /// 
      /// TODO THESE BREAK FOR SOME REASON BUT THEY ARE IN FACT REVERTING SO ITS CHILL
      ///
      await expect(revest.connect(whaleSigners[6]).withdrawFNFT(principalId1, 1)).to.be.reverted
      await expect(revest.connect(whaleSigners[6]).withdrawFNFT(principalId2, 1)).to.be.reverted

      await expect(revest.connect(whaleSigners[8]).withdrawFNFT(interestId1, 1)).to.be.reverted
      await expect(revest.connect(whaleSigners[8]).withdrawFNFT(interestId2, 1)).to.be.reverted
    })


    step("fast forward 1 year to withdrawal and appreciate", async () => {

      await fastForwardAndAppreciate(15)

      let numTokensAppreciation = 5000

      let poolt0_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t0))
      let poolt1_bal = await mockVault.balanceOf(await resonateHelper.getAddressForFNFT(pool_t1))

      let totalSupply = await mockVault.totalSupply();

      console.log(`Pool t0 balance: ${poolt0_bal}`)
      console.log(`Pool t1 balance: ${poolt1_bal}`)

      console.log(`Total Supply: ${totalSupply}`)
      console.log(`Total Assets: ${await mockVault.totalAssets()}`)

      //should be 50% or 0.5
      console.log(`Percent of total Shares pool_t0: ${(poolt0_bal.toNumber() / totalSupply.toNumber()) * 100}%`)
      console.log(`Percent of total Shares pool_t1: ${(poolt1_bal.toNumber() / totalSupply.toNumber()) * 100}%`)

      console.log(`Price per one share: ${await mockVault.convertToAssets(ethers.utils.parseUnits("1", 6))}`)
      console.log(`Pool can Claim: ${await mockVault.previewRedeem(poolt0_bal)}`)

      console.log(`Num Shares per FNFT: ${numShares}`)
      let percentInterestOwed = numShares.toNumber() / totalSupply.toNumber()
      console.log(`Percent of Interest owed: ${percentInterestOwed * 100}%`)
      console.log(`Interest Owed: ${percentInterestOwed * numTokensAppreciation}`)

      let expectedInterest = ethers.utils.parseUnits((percentInterestOwed * numTokensAppreciation).toFixed(6).toString(), 6)

      let activeFNFT = await resonate.activated(await resonate.fnftIdToIndex(principalId1));
      console.log(`Shares for FNFT: ${activeFNFT.sharesPerPacket}`)
      console.log(`Means redeeming for: ${await mockVault.previewRedeem(activeFNFT.sharesPerPacket)}`)

      console.log(`Actual Interest: ${(await resonateHelper.calculateInterest(principalId1)).interest}`)
      console.log(`Expected Interest: ${expectedInterest}`)

      expect((await resonateHelper.calculateInterest(principalId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId1)).interest).to.be.closeTo(expectedInterest, confidenceInterval)

      expect((await resonateHelper.calculateInterest(principalId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
      expect((await resonateHelper.calculateInterest(interestId2)).interest).to.be.closeTo(expectedInterest, confidenceInterval)
    })

    step("withdraw from time-locked type-0 pool", async () => {
      let preBalUSDC = await usdcCon.balanceOf(whaleSigners[6]._address);

      let expectedInterestVal = await resonateHelper.calculateInterest(interestId1) //current FNFT Interest
      console.log(`Expected Interest for Principal FNFT1: ${expectedInterestVal}`)
      console.log(`Expected Interest for Principal FNFT2: ${await resonateHelper.calculateInterest(interestId2)}`)

      await revest.connect(whaleSigners[6]).withdrawFNFT(principalId1, 1);

      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.eq(preBalUSDC.add(consumerDepositAmount))
      expect(await fnftHandler.getBalance(whaleSigners[6]._address, principalId1)).to.eq(0)

      //TODO - Withdraw interest from type-1 pool.
      let preBalUSDCProducer = await usdcCon.balanceOf(whaleSigners[8]._address)
      
      await revest.connect(whaleSigners[8]).withdrawFNFT(interestId1, 1);

      let afterBalUSDCProducer = await usdcCon.balanceOf(whaleSigners[8]._address);

      console.log(`Bal Before Withdrawal: ${preBalUSDCProducer}`);
      console.log(`Bal After Withdrawal: ${afterBalUSDCProducer}`);

      expect(afterBalUSDCProducer).to.be.closeTo(preBalUSDCProducer.add(expectedInterestVal.interestAfterFee), confidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, interestId1)).to.eq(0);
    })

    step("withdraw from address-locked type-1 pool", async () => {
    
      let preBalUSDC = await usdcCon.balanceOf(whaleSigners[6]._address);

      let expectedInterestVal = await resonateHelper.calculateInterest(interestId2) //current FNFT Interest

      console.log(`Expected Interest --- ${expectedInterestVal}`)
      await revest.connect(whaleSigners[6]).withdrawFNFT(principalId2, 1);

      expect(await usdcCon.balanceOf(whaleSigners[6]._address)).to.be.closeTo(preBalUSDC.add(consumerDepositAmount), confidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[6]._address, principalId2)).to.eq(0)

      //TODO - Withdraw interest from type-1 pool.
      let preBalUSDCProducer = await usdcCon.balanceOf(whaleSigners[8]._address)
      
      await revest.connect(whaleSigners[8]).withdrawFNFT(interestId2, 1);

      let afterBalUSDCProducer = await usdcCon.balanceOf(whaleSigners[8]._address);

      console.log(`Bal Before Withdrawal: ${preBalUSDCProducer}`);
      console.log(`Bal After Withdrawal: ${afterBalUSDCProducer}`);

      expect(afterBalUSDCProducer).to.be.closeTo(preBalUSDCProducer.add(expectedInterestVal.interestAfterFee), confidenceInterval)
      expect(await fnftHandler.getBalance(whaleSigners[1]._address, interestId2)).to.eq(0);
    })

  });

  
  async function main() {
    console.log("got here")
    const signers = await ethers.getSigners();
    const owner = signers[0];
    console.log("OWNER: " + owner.address)

    const whale = ethers.provider.getSigner("0x2c6fd9269C28DE1cA4a3c46e7d47447eFFAAB8C1");
    setupImpersonator("0x2c6fd9269C28DE1cA4a3c46e7d47447eFFAAB8C1");

    await whale.sendTransaction({
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      value: ethers.utils.parseEther("3"),
    })

    await whale.sendTransaction({
      to: "0xAe120F0df055428E45b264E7794A18c54a2a3fAF",
      value: ethers.utils.parseEther("3"),
    })

    let bal = await ethers.provider.getBalance("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
    console.log(`Balance: ${bal}`)
    
    console.log(separator);
    console.log("\tDeploying RevestAddressRegistry");
    const RevestAddressRegistry = await ethers.getContractAt("IAddressRegistry", "0xd2c6eB7527Ab1E188638B86F2c14bbAd5A431d78");

    console.log(separator);
    console.log("Deploying Address Lock Proxy");
    const ResonateAddressProxyFactory = await ethers.getContractFactory("AddressLockProxy");
    const AddressLockProxy = await ResonateAddressProxyFactory.deploy();
    await AddressLockProxy.deployed();

    console.log(separator);
    console.log("Deploying OutputReceiver Proxy")
    const ResonateOutputReceiverProxy = await ethers.getContractFactory("OutputReceiverProxy")
    const OutputReceiverProxy = await ResonateOutputReceiverProxy.deploy(RevestAddressRegistry.address);

    console.log(separator);
    console.log("Deploying Sandwich Bot Proxy")
    const SandwichBotProxyFactory = await ethers.getContractFactory("SandwichBotProxy")
    const SandwichBotProxy = await SandwichBotProxyFactory.deploy() as SandwichBotProxy;

    console.log(separator);
    console.log("Deploying Resonate Helper")
    const resonateHelperFactory = await ethers.getContractFactory("ResonateHelper")
    const ResonateHelper = await resonateHelperFactory.deploy(SandwichBotProxy.address)

    console.log(separator);
    console.log("Deploying SmartWalletChecker");
    const smartWalletCheckerFactory = await ethers.getContractFactory("SmartWalletWhitelistV2");
    const SmartWalletCheckerV2 = await smartWalletCheckerFactory.deploy(owner.address);

    console.log(separator);
    console.log("Deploying PriceProvider");
    const priceProviderFactory = await ethers.getContractFactory("PriceProvider");
    const PriceProvider = await priceProviderFactory.deploy();

    console.log(separator);
    console.log("Deploying DevWallet");
    const devWalletFactory = await ethers.getContractFactory("DevWallet");
    const DevWallet = await devWalletFactory.deploy();

    console.log(separator);
    console.log("\tDeploying Resonate");
    const ResonateFactory = await ethers.getContractFactory("Resonate");
    const Resonate = await ResonateFactory.deploy(
      RevestAddressRegistry.address, 
      OutputReceiverProxy.address,
      AddressLockProxy.address, 
      ResonateHelper.address, 
      SmartWalletCheckerV2.address, 
      PriceProvider.address,
      DevWallet.address
    );
    await Resonate.deployed();

    console.log(separator);
    console.log("\tSetting up Proxy Contracts with Resonate")
    await OutputReceiverProxy.setResonate(Resonate.address)
    await AddressLockProxy.setResonate(Resonate.address);

    console.log(separator);
    console.log("\tDeploying Mock USDC Rari Vault")
    const mockVaultFactory = await ethers.getContractFactory("RariVault")
    const RariVault = await mockVaultFactory.deploy(usdc)
    await RariVault.deployed()

    console.log(separator);
    console.log("\tDeploying Mock WETH Rari Vault")
    const wethVaultFactory = await ethers.getContractFactory("RariVault")
    const wethRariVault = await wethVaultFactory.deploy(weth)
    await wethRariVault.deployed()

    console.log("\tDeploying Mock SUSHI Rari Vault")
    const SushivaultFactory = await ethers.getContractFactory("RariVault")
    const SushiVault = await SushivaultFactory.deploy(sushi)
    await SushiVault.deployed()

    console.log("\tDeploying Mock USDT Rari Vault")
    const tetherVaultFactory = await ethers.getContractFactory("RariVault")
    const TetherVault = await tetherVaultFactory.deploy(usdt)
    await TetherVault.deployed()

    console.log(separator);
    console.log("\tDeploying FNFT Handler");
    const FNFTHandler = new ethers.Contract(PROTOCOL.REVEST.REVEST_FNFT_HANDLER[1], fnftABI, ethers.provider) as IFNFTHandler

    console.log(separator);
    console.log("\tDeploying LockManager");
    const LockManager = new ethers.Contract(PROTOCOL.REVEST.REVEST_LOCK_MANAGER[1], lockManagerABI, ethers.provider) as ILockManager;

    console.log(separator);
    console.log("\tDeploying Revest");
    const Revest = new ethers.Contract(PROTOCOL.REVEST.REVEST_CONTRACT[1], revestABI, ethers.provider) as IRevest;

    console.log(separator);
    console.log("\tDeploying Token Vault V2");
    const TokenVault = new ethers.Contract(PROTOCOL.REVEST.REVEST_TOKEN_VAULT[1], tokenVaultABI, ethers.provider) as ITokenVault;

    console.log(separator)
    console.log("\tDeploying Uniswap Oracle Dispatch");
    // const OracleDispatch = new ethers.Contract(ORACLE.CHAINLINK["USDC/ETH"], oracleDispatchABI, ethers.provider) as IOracleDispatch;
    const oracleDispatchFactory = await ethers.getContractFactory("mockOracleDispatch");
    const fakeOracle = await oracleDispatchFactory.deploy() as MockOracleDispatch
    //SandwichBotProxy.address of the handler to Resonate
    await ResonateHelper.setResonate(Resonate.address);
    await SandwichBotProxy.setResonateHelper(ResonateHelper.address);




    resonate = Resonate;
    lockManager = LockManager;
    fnftHandler =  FNFTHandler;
    revest = Revest
    vault = TokenVault
    mockVault = RariVault
    addressLockproxy = AddressLockProxy
    outputreceiverProxy = OutputReceiverProxy
    resonateHelper = ResonateHelper
    mockWethVault = wethRariVault;
    mockOracleDispatch = fakeOracle
    sushiVault = SushiVault
    usdtVault = TetherVault
    sandwichBotProxy = SandwichBotProxy
    smartWalletWhitelist = SmartWalletCheckerV2;
    priceProvider = PriceProvider;
    DEV_WALLET = DevWallet.address;

    console.log(`Resonate: ${resonate.address}`)
    console.log(`Address Lock Proxy: ${AddressLockProxy.address}`)
    console.log(`OutputReceiver Proxy: ${OutputReceiverProxy.address}`)
    console.log(`Smart Wallet Handler: ${resonateHelper.address}`)
    console.log(`Lock Manager: ${lockManager.address}`)
    console.log(`FNFT Handler: ${fnftHandler.address}`)
    console.log(`Revest: ${revest.address}`)
    console.log(`Token Vault: ${vault.address}`)
    console.log(`Mock USDC Vault: ${mockVault.address}`)
    console.log(`Mock wETH Vault: ${mockWethVault.address}`)
    console.log(`Mock Sushi Vault: ${sushiVault.address}`)
    console.log(`Mock USDT Vault: ${usdtVault.address}`)
    console.log(`Mock Oracle Dispatch: ${mockOracleDispatch.address}`)
    console.log(`Sandwich Bot Proxy: ${sandwichBotProxy.address}`)

  }
});