const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require('fs');


const SEPERATOR = "\t-----------------------------------------"

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

/// TODO: Refactor to a for-loop


async function main() {
    const signers = await ethers.getSigners();
    const owner = signers[0];//TODO: Change to multisig
    console.log("OWNER: " + owner.address)
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;

    let ResonateAddressRegistry = PROVIDERS[chainId];

    console.log(SEPERATOR);
    console.log("\tDeploying Address Lock Proxy");
    const ResonateAddressProxyFactory = await ethers.getContractFactory("AddressLockProxy");
    //const AddressLockProxy = ResonateAddressProxyFactory.attach('0xbfacb56e0Ab0dc99E80a95B0412c8DC9C035cD2D');
    const AddressLockProxy = await ResonateAddressProxyFactory.deploy();
    await AddressLockProxy.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying OutputReceiver Proxy")
    const ResonateOutputReceiverProxy = await ethers.getContractFactory("OutputReceiverProxy")
    //const OutputReceiverProxy = ResonateAddressProxyFactory.attach('0x8f74c989252B94Fd2d08a668884D303D57c91422')
    const OutputReceiverProxy = await ResonateOutputReceiverProxy.deploy(ResonateAddressRegistry);
    await OutputReceiverProxy.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying Sandwich Bot Proxy")
    const SandwichBotProxyFactory = await ethers.getContractFactory("SandwichBotProxy")
    //const SandwichBotProxy = SandwichBotProxyFactory.attach('0xEDb07875051B26b56747e738efB3d7a271d9145e');
    const SandwichBotProxy = await SandwichBotProxyFactory.deploy()
    await SandwichBotProxy.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying ResonateHelper")
    const resonateHelperFactory = await ethers.getContractFactory("ResonateHelper")
    //const ResonateHelper = resonateHelperFactory.attach('0xEbB1185f41A2347Dd77B45e1F5e068f1e84f536a');
    const ResonateHelper = await resonateHelperFactory.deploy(SandwichBotProxy.address)
    await ResonateHelper.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying SmartWalletChecker");
    const smartWalletCheckerFactory = await ethers.getContractFactory("SmartWalletWhitelistV2");
    //const SmartWalletCheckerV2 = smartWalletCheckerFactory.attach('0x492CbB6217D34d68f0abb77a9D9781C8CcbfdFE8')
    const SmartWalletCheckerV2 = await smartWalletCheckerFactory.deploy(owner.address);
    await SmartWalletCheckerV2.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying PriceProvider");
    const priceProviderFactory = await ethers.getContractFactory("PriceProvider");
    //const PriceProvider = priceProviderFactory.attach("0x0F89ba3F140Ea9370aB05d434B8e32fDf41a6093");
    const PriceProvider = await priceProviderFactory.deploy();
    await PriceProvider.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying DevWallet");
    const devWalletFactory = await ethers.getContractFactory("DevWallet");
    //const DevWallet = devWalletFactory.attach('0x00fD2c29CF3AA4880A4C05e7CA1382bF987B3495');
    const DevWallet = await devWalletFactory.deploy();
    await DevWallet.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying MetadataHandler");
    const MetadataHandlerFactory = await ethers.getContractFactory("MetadataHandler");
    //const MetadataHandler = MetadataHandlerFactory.attach('0x3Bf38B338c5c45AB8068827f3bF92Cbca951B87F')
    const MetadataHandler = await MetadataHandlerFactory.deploy();
    await MetadataHandler.deployed();

    console.log(SEPERATOR);
    console.log("\tDeploying Resonate");
    const ResonateFactory = await ethers.getContractFactory("Resonate");
    const Resonate = await ResonateFactory.deploy(
        ResonateAddressRegistry,
        OutputReceiverProxy.address,
        AddressLockProxy.address, 
        ResonateHelper.address, 
        SmartWalletCheckerV2.address, 
        PriceProvider.address,
        DevWallet.address
    );
    await Resonate.deployed();
    //const Resonate = ResonateFactory.attach('0x80CA847618030Bc3e26aD2c444FD007279DaF50A');

    
    // Uncomment when redeployment needed
    console.log(SEPERATOR);
    console.log("\tDeploying Chainlink USD Oracle")
    const chainlinkUSDFactory = await ethers.getContractFactory("ChainlinkPriceOracle")
    //const ChainlinkUSD = chainlinkUSDFactory.attach("0x3CEaF680A98155acDAfa14FdA047B42825BBC643");
    const ChainlinkUSD = await chainlinkUSDFactory.deploy(PriceProvider.address, CHAINLINK_USD[chainId]);
    await ChainlinkUSD.deployed();   

    console.log(SEPERATOR);
    console.log("\tSetting up Proxy Contracts with Resonate");
    let tx = await OutputReceiverProxy.setResonate(Resonate.address);
    await tx.wait();
    
    tx = await OutputReceiverProxy.setMetadataHandler(MetadataHandler.address);
    await tx.wait();
    
    tx = await AddressLockProxy.setResonate(Resonate.address);
    await tx.wait();
    tx = await AddressLockProxy.setMetadataHandler(MetadataHandler.address);
    await tx.wait();

    tx = await MetadataHandler.setResonate(Resonate.address);
    await tx.wait();

    tx = await ResonateHelper.setResonate(Resonate.address);
    await tx.wait();

    tx = await SandwichBotProxy.setResonateHelper(ResonateHelper.address);
    await tx.wait();

    // 
    console.log("-------------SCRIPT COMPLETE------------------")

    console.log(SEPERATOR);

    let PoolSmartWallet = await ResonateHelper.POOL_TEMPLATE();
    let SmartWallet = await ResonateHelper.FNFT_TEMPLATE();

    console.log("\tDeployment Completed.\n");
    console.log(`\tResonate: ${Resonate.address}`)
    console.log(`\tAddress Lock Proxy: ${AddressLockProxy.address}`)
    console.log(`\tOutputReceiver Proxy: ${OutputReceiverProxy.address}`)
    console.log(`\tResonate Helper: ${ResonateHelper.address}`)
    console.log(`\tSandwich Bot Proxy: ${SandwichBotProxy.address}`)
    console.log(`\tPriceProvider: ${PriceProvider.address}`)
    console.log(`\tSmart Wallet Checker: ${SmartWalletCheckerV2.address}`)
    console.log(`\tDev Wallet: ${DevWallet.address}`)
    console.log(`\tMetadata Handler: ${MetadataHandler.address}`)
    console.log(`\tChainlink USD Oracle: ${ChainlinkUSD.address}`)
    console.log(`\tPoolSmartWallet: ${PoolSmartWallet}`)
    console.log(`\tSmartWallet: ${SmartWallet}`)



    let snapshot = {
        Resonate: Resonate.address,
        ResonateHelper: ResonateHelper.address,
        AddressLockProxy: AddressLockProxy.address,
        OutputReceiverProxy: OutputReceiverProxy.address,
        MetadataHandler: MetadataHandler.address,
        SandwichBotProxy: SandwichBotProxy.address,
        SmartWalletChecker: SmartWalletCheckerV2.address,
        PriceProvider: PriceProvider.address,
        DevWallet: DevWallet.address,
        Chainlink: ChainlinkUSD.address,
        PoolSmartWallet:PoolSmartWallet,
        SmartWallet:SmartWallet,
    };
    
    let stringified = JSON.stringify(snapshot);
    fs.writeFileSync('./scripts/data/snapshot'+chainId+'.json', stringified, (err) => {
        if (err) console.log('Error writing file:', err)
    })
   
}

const USD_PRICE_FEEDS = {
    250: [
        { // USDC
            TOKEN: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
            FEED: "0x2553f4eeb82d5a26427b8d1106c51499cba5d99c"
        },
        { // DAI
            TOKEN: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
            FEED: "0x91d5defaffe2854c7d02f50c80fa1fdc8a721e52"
        },
        { // BOO
            TOKEN: "0x841fad6eae12c286d1fd18d1d525dffa75c7effe",
            FEED: "0xc8c80c17f05930876ba7c1dd50d9186213496376"
        },
        { // FTM
            TOKEN: "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
            FEED: "0xf4766552d15ae4d256ad41b6cf2933482b0680dc"
        },
        {
            // MIM
            TOKEN: "0x82f0B8B456c1A451378467398982d4834b6829c1",
            FEED: "0x28de48d3291f31f839274b8d82691c77df1c5ced"
        },
        {
            //fUSDT
            TOKEN:"0x049d68029688eAbF473097a2fC38ef61633A3C7A",
            FEED:"0xf64b636c5dfe1d3555a847341cdc449f612307d0"
        },
    ],
    31337: [
        { // USDC
            TOKEN: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
            FEED: "0x2553f4eeb82d5a26427b8d1106c51499cba5d99c"
        },
        { // DAI
            TOKEN: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
            FEED: "0x91d5defaffe2854c7d02f50c80fa1fdc8a721e52"
        },
        { // BOO
            TOKEN: "0x841fad6eae12c286d1fd18d1d525dffa75c7effe",
            FEED: "0xc8c80c17f05930876ba7c1dd50d9186213496376"
        }

    ]
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.log("Deployment Error.\n\n----------------------------------------------\n");
        console.error(error);
        process.exit(1);
    })
