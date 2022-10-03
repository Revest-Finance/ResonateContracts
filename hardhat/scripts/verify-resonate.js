const hre = require("hardhat");
const ethers = hre.ethers;

const PROVIDERS = {
    1:'0xd2c6eB7527Ab1E188638B86F2c14bbAd5A431d78',
    4:"0x6c20EE3bCdE467352F935Ac86014F393a1588BBF",
    10:"0x780CE455bc835127182809Bc8fF36fFfE55Bc4B8",
    137:"0x209F3F7750d4CC52776e3e243717b3A8aDE413eB",
    250:"0xEf0bF9B5170E0e7f4bBC09f7cBDB145943D3e3a7",
    42161:"0x36C2732f1B2ED69CF17133aB01f2876B614a2F27",
    43114:"0x64e12fEA089e52A06A7A76028C809159ba4c1b1a",
    31337:'0xEf0bF9B5170E0e7f4bBC09f7cBDB145943D3e3a7',
};
const CHAINLINK_USD = {
    1:'0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419',
    4:"",
    137:"0xefb7e6be8356ccc6827799b6a7348ee674a80eae",
    10:"0x13e3ee699d1909e989722e753853ae30b17e08c5",
    250:"0x11ddd3d147e5b83d01cee7070027092397d63658",
    42161: "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612",
    43114:"",
    31337:'0x11ddd3d147e5b83d01cee7070027092397d63658',
}


// Current is Fantom Opera deployment

async function main() {
    const signers = await ethers.getSigners();
    const owner = signers[0];//TODO: Change to multisig
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;

    let snapshot = require('./data/snapshot' + chainId + '.json');

    let ResonateAddressRegistry = PROVIDERS[chainId];
    
    await run("verify:verify", {
        address: snapshot['SmartWallet'],
        constructorArguments: [snapshot['Resonate']],
    })

    await run("verify:verify", {
        address: snapshot['PoolSmartWallet'],
        constructorArguments: [snapshot['Resonate']],
    })
    await run("verify:verify", {
        address: snapshot['SmartWalletChecker'],
        constructorArguments: [owner.address],
    })

    await run("verify:verify", {
        address: snapshot['AddressLockProxy'],
        constructorArguments: [],
    })
    
    await run("verify:verify", {
        address: snapshot['DevWallet'],
        constructorArguments: [],
    })


    await run("verify:verify", {
        address: snapshot['OutputReceiverProxy'],
        constructorArguments: [
            ResonateAddressRegistry
        ],
    })*

    await run("verify:verify", {
        address: snapshot['SandwichBotProxy'],
        constructorArguments: [],
    })
    
    
    
    
    await run("verify:verify", {
        address: snapshot['PriceProvider'],
        constructorArguments: [],
    })
    

    await run("verify:verify", {
        address: snapshot['Resonate'],
        constructorArguments: [
            ResonateAddressRegistry,
            snapshot['OutputReceiverProxy'],
            snapshot['AddressLockProxy'],
            snapshot['ResonateHelper'],
            snapshot['SmartWalletChecker'],
            snapshot['PriceProvider'],
            snapshot['DevWallet']
        ],
    })

    await run("verify:verify", {
        address: snapshot['MetadataHandler'],
        constructorArguments: [],
    })
    
    await run("verify:verify", {
        address: snapshot['Chainlink'],
        constructorArguments: [
            snapshot['PriceProvider'],
            CHAINLINK_USD[chainId]
        ],
    })

    await run("verify:verify", {
        address: snapshot['ResonateHelper'],
        constructorArguments: [
            snapshot['SandwichBotProxy']
        ],
    });
    
    
    

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
