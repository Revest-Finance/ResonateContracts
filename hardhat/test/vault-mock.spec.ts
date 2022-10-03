// Run with `npx hardhat test test/revest-primary.js`
import { use } from "chai";
import { expect, assert, } from "chai";
import { step } from 'mocha-steps'
import { ethers, network } from "hardhat";
import { solidity } from "ethereum-waffle";
import { BigNumber, BytesLike, Contract, ContractTransaction, providers } from "ethers";
import { ERC20, RariVault } from "typechain";
import { ether, TOKEN, VAULTS } from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ERC20_ABI } from "./utils/abi";

use(solidity)
describe.only("Rari Vault", async () => {
    let vault: RariVault
    let owner: SignerWithAddress
    let USDC_WHALE: SignerWithAddress
    let actorA: SignerWithAddress
    let USDC: ERC20;
    before(async () => {
        console.log(`\tBlock #: ${await ethers.provider.getBlockNumber()}`);
        const signers = await ethers.getSigners();
        owner = signers[0]
        // Impersonate USDC whale who will deploy vault
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x72a53cdbbcc1b9efa39c834a540550e23463aacb"]
          });
        USDC_WHALE = await ethers.getSigner("0x72a53cdbbcc1b9efa39c834a540550e23463aacb")
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0xbcf5ab858cb0c003adb5226bdbfecd0bfd7b6d9f"]
          });
        actorA = await ethers.getSigner("0xbcf5ab858cb0c003adb5226bdbfecd0bfd7b6d9f")

        USDC = await ethers.getContractAt(ERC20_ABI, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", owner) as ERC20;
        console.log(`\tAddress: ${USDC.address}`);
        console.log(`\tTotal Supply: ${await USDC.totalSupply()}`);
        console.log(`\tWhale Balance: ${await USDC.balanceOf(USDC_WHALE.address)}`)
    })
    it("deployed", async () => {
        const VaultFactory =  await ethers.getContractFactory("RariVault")
        vault = await VaultFactory.deploy(TOKEN.USDC)
        expect(await vault.deployed())
        // Fund the vault?
        //Approve deposit amount
        const tx1 = await USDC.connect(USDC_WHALE).approve(vault.address, BigNumber.from("1000000000"));
        tx1.wait();
        //Deposit
        await vault.connect(USDC_WHALE).deposit(BigNumber.from("1000000000"), USDC_WHALE.address)
    })
    it("checks", async () => {
        let total_assets = await vault.totalAssets()
        console.log(`\tVault total assets: ${total_assets}`)
        expect(total_assets == BigNumber.from("1000000000"))

        let balance_A = await vault.balanceOf(actorA.address)
        console.log(`\tActor A now has shares = ${balance_A}`)
        expect(balance_A).to.eq(0)

        const deposit = BigNumber.from("485")
        console.log(`\tDeposit amount: ${deposit}`);
        console.log(`\tShares expected: ${await vault.convertToShares(deposit)}`)
        //Approve deposit amount
        const tx1 = await USDC.connect(actorA).approve(vault.address, deposit);
        tx1.wait();
        //Deposit
        await vault.connect(actorA).deposit(deposit, actorA.address)

        total_assets = await vault.totalAssets()
        console.log(`\tVault now has assets: ${total_assets}`)
        expect(total_assets == deposit)
        console.log(`\tVault total supply: ${await vault.totalSupply()}`)
        expect(total_assets == deposit)

        //Actor should now have shares
        console.log(`\tActor A now has shares = ${await vault.balanceOf(actorA.address)}`)
    
        let redeem = await vault.previewRedeem(await vault.balanceOf(actorA.address))
        console.log(`\tActior can now redeem shares for assets = ${redeem}`);

        //Vault doubles in value for whatever reason.
        const tx2 = await USDC.connect(USDC_WHALE).transfer(vault.address, BigNumber.from("1000000000"))
        tx2.wait()

        
        total_assets = await vault.totalAssets()
        console.log(`\tVault now has assets: ${total_assets}`)
        expect(total_assets == deposit)
        console.log(`\tVault total supply: ${await vault.totalSupply()}`)
        expect(total_assets == deposit)

        redeem = await vault.previewRedeem(await vault.balanceOf(actorA.address))
        console.log(`\tActor can now redeem shares for assets = ${redeem}`);
    })
})