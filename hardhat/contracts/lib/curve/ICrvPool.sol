pragma solidity >=0.8.0;

interface ICrvPool {

    // @notice Perform an exchange between two coins
    // @dev Index values can be found via the `coins` public getter method
    // @param i Index value for the coin to send
    // @param j Index valie of the coin to recieve
    // @param _dx Amount of `i` being exchanged
    // @param _min_dy Minimum amount of `j` to receive
    // @return Actual amount of `j` received
    // function exchange(
    //     uint256 i,
    //     uint256 j,
    //     uint256 dx,
    //     uint256 min_dy
    // ) external payable returns (uint256);

    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external payable returns (uint256);

    //Get the amount of coin j one would receive for swapping _dx of coin i.
    // function get_dy(uint256 i, uint256 j, uint256 _dx) external view returns (uint256);
    function get_dy(int128 i, int128 j, uint256 _dx) external view returns (uint256);

    function balances(uint256) external view returns (uint256);
    function A() external view returns (uint256);
    function fee() external view returns (uint256);

    //Minting Functions
    function mint(address gauge_addr) external;
    function minted(address _for, address gauge_addr) external view returns(uint256);

    function toggle_approve_mint(address minting_user) external;


    //Gauge Functions
    function lp_token() external view returns(address);
    function crv_token() external view returns(address);
 
    function balanceOf(address addr) external view returns (uint256);
    function deposit(uint256 _value) external;
    function withdraw(uint256 _value) external;

    function claimable_tokens(address addr) external returns (uint256);
    function minter() external view returns(address); //use minter().mint(gauge_addr) to claim CRV
    function integrate_fraction(address _for) external view returns(uint256);
    function user_checkpoint(address _for) external returns(bool);

    //Deposit Contract Functions
    function add_liquidity(uint256[4] calldata uamounts, uint256 min_mint_amount) external;
    function remove_liquidity(uint256 _amount, uint256[4] calldata min_uamounts) external;
    function remove_liquidity_imbalance(uint256[4] calldata uamounts, uint256 max_burn_amount) external;

    function coins(int128 i) external view returns (address);
    function underlying_coins(int128 i) external view returns (address);
    function underlying_coins() external view returns (address[4] memory);
    function curve() external view returns (address);
    function token() external view returns (address);
}