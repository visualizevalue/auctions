// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Auctions is
    ERC721Holder,
    ERC1155Holder,
    ReentrancyGuard
{
    /// @notice Minimum auction duration after a bid in seconds (5 minutes).
    uint32 public constant BIDDING_GRACE_PERIOD = 5 minutes;

    /// @notice Each bid has to increase by at least 10%
    uint32 public constant BID_PERCENTAGE_INCREASE = 10;

    /// @notice The next auction ID
    uint64 public nextAuctionId;

    struct Auction {
        address tokenContract;
        uint256 tokenId;
        address latestBidder;
        uint128 latestBid;
        uint32 endTimestamp;
        uint16 tokenERCStandard;
        uint8 tokenAmount;
        bool settled;
        address payable beneficiary;
    }

    /// @dev Each auction is identified by an ID
    mapping(uint256 => Auction) private _auctions;

    /// @dev When the automatic refunds of previous bids fail, they are stored in here
    mapping(address => uint256) private _balances;

    /// @dev Emitted when an NFT is sent to the contract.
    event AuctionInitialised(
        uint64 indexed auctionId,
        address indexed tokenContract,
        uint256 indexed tokenId,
        address beneficiary,
        uint32 endTimestamp
    );

    /// @dev Emitted when a new bid is entered.
    event Bid(uint64 indexed auctionId, uint256 indexed bid, address indexed from);

    /// @dev Emitted when a new bid is entered within the BIDDING_GRACE_PERIOD.
    event AuctionExtended(uint64 indexed auctionId, uint256 indexed endTimestamp);

    /// @dev Emitted when an auction is settled, the NFT is sent to the winner and the funds sent to the beneficiary.
    event AuctionSettled(
        uint64 indexed auctionId,
        address indexed winner,
        address indexed beneficiary,
        uint256 amount
    );

    error MinimumBidNotMet();
    error AuctionNotActive();
    error AuctionAlreadySettled();
    error AuctionDoesNotExist();
    error AuctionNotComplete();
    error FailedToForwardFunds();
    error NoBalanceToWithdraw();
    error TooManyTokens();
    error InvalidBeneficiary();
    error UnsupportedTokenStandard();
    error InvalidAuctionParameters();

    /// @dev Hook for `safeTransferFrom` of ERC721 tokens to this contract
    /// @param from The address which previously owned the token
    /// @param tokenId The ID of the token being transferred
    /// @param data The auction parameters encoded as: address beneficiary (20 bytes)
    function onERC721Received(
        address, // The (approved) address which initiated the transfer
        address from,
        uint256 tokenId,
        bytes memory data
    ) public override returns (bytes4) {
        // Decode auction parameters from data
        address payable beneficiary = _decodeAuctionParams(data);

        _initializeAuction(
            msg.sender,  // token contract address
            tokenId,
            721,
            from,
            1,
            beneficiary
        );

        return this.onERC721Received.selector;
    }

    /// @dev Hook for `safeTransferFrom` of ERC1155 tokens to this contract
    /// @param from The address which previously owned the token
    /// @param id The ID of the token being transferred
    /// @param value The amount of tokens being transferred
    /// @param data The auction parameters encoded as: address beneficiary (20 bytes)
    function onERC1155Received(
        address, // The (approved) address which initiated the transfer
        address from,
        uint256 id,
        uint256 value,
        bytes memory data
    ) public override returns (bytes4) {
        if (value >= 256) {
            revert TooManyTokens();
        }

        // Decode auction parameters from data
        address payable beneficiary = _decodeAuctionParams(data);

        _initializeAuction(
            msg.sender,  // token contract address
            id,
            1155,
            from,
            uint8(value),
            beneficiary
        );

        return this.onERC1155Received.selector;
    }

    /// @dev Create a new auction for an ERC721 token
    /// @param tokenContract The address of the ERC721 contract
    /// @param tokenId The ID of the token to auction
    /// @param beneficiary The address that will receive the auction proceeds
    function createERC721Auction(
        address tokenContract,
        uint256 tokenId,
        address payable beneficiary
    ) external {
        if (beneficiary == address(0)) {
            revert InvalidBeneficiary();
        }

        // Transfer the token to this contract
        IERC721(tokenContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            ""
        );

        _initializeAuction(
            tokenContract,
            tokenId,
            721,
            msg.sender,
            1,
            beneficiary
        );
    }

    /// @dev Create a new auction for an ERC1155 token
    /// @param tokenContract The address of the ERC1155 contract
    /// @param tokenId The ID of the token to auction
    /// @param amount The amount of tokens to auction
    /// @param beneficiary The address that will receive the auction proceeds
    function createERC1155Auction(
        address tokenContract,
        uint256 tokenId,
        uint8 amount,
        address payable beneficiary
    ) external {
        if (beneficiary == address(0)) {
            revert InvalidBeneficiary();
        }
        if (amount >= 256) {
            revert TooManyTokens();
        }

        // Transfer the tokens to this contract
        IERC1155(tokenContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            amount,
            ""
        );

        _initializeAuction(
            tokenContract,
            tokenId,
            1155,
            msg.sender,
            amount,
            beneficiary
        );
    }

    /// @dev Get an Auction by its ID
    function getAuction(uint64 auctionId)
        public
        view
        returns (
            address tokenContract,
            uint256 tokenId,
            address latestBidder,
            uint128 latestBid,
            uint32 endTimestamp,
            uint16 tokenERCStandard,
            uint8 tokenAmount,
            bool settled,
            address beneficiary
        )
    {
        Auction memory auction = _auctions[auctionId];
        return (
            auction.tokenContract,
            auction.tokenId,
            auction.latestBidder,
            auction.latestBid,
            auction.endTimestamp,
            auction.tokenERCStandard,
            auction.tokenAmount,
            auction.settled,
            auction.beneficiary
        );
    }

    /// @dev The minimum value of the next bid for an auction.
    function currentBidPrice(uint64 auctionId) external view returns (uint256) {
        return _currentBidPrice(_auctions[auctionId]);
    }

    /// @dev Enter a new bid
    /// @param auctionId The Auction ID to bid on
    function bid(uint64 auctionId) external payable nonReentrant {
        Auction storage auction = _auctions[auctionId];
        uint256 bidValue = msg.value;
        address bidder = msg.sender;

        if (bidValue < _currentBidPrice(auction)) {
            revert MinimumBidNotMet();
        }
        if (block.timestamp > auction.endTimestamp) {
            revert AuctionNotActive();
        }

        // Pay back previous bidder
        if (_hasBid(auction)) {
            (bool success,) = payable(auction.latestBidder).call{value: auction.latestBid}("");
            if (!success) {
                _balances[auction.latestBidder] += auction.latestBid;
            }
        }

        _maybeExtendTime(auctionId, auction);

        // Store the bid
        auction.latestBid = uint128(bidValue);
        auction.latestBidder = bidder;

        emit Bid(auctionId, bidValue, bidder);
    }

    /// @dev Settles an auction
    /// @param auctionId The Auction ID to claim.
    function settle(uint64 auctionId) external {
        Auction storage auction = _auctions[auctionId];
        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (block.timestamp <= auction.endTimestamp) revert AuctionNotComplete();

        address winner = _hasBid(auction) ? auction.latestBidder : auction.latestBidder;

        // Send the funds to the beneficiary if there was a bid
        if (_hasBid(auction)) {
            (bool success,) = auction.beneficiary.call{value: auction.latestBid}("");
            if (!success) {
                _balances[auction.beneficiary] += auction.latestBid;
            }
        }

        // Transfer the NFT to the winner
        if (auction.tokenERCStandard == 721) {
            IERC721(auction.tokenContract).safeTransferFrom(
                address(this),
                winner,
                auction.tokenId,
                ""
            );
        } else if (auction.tokenERCStandard == 1155) {
            IERC1155(auction.tokenContract).safeTransferFrom(
                address(this),
                winner,
                auction.tokenId,
                auction.tokenAmount,
                ""
            );
        } else {
            revert UnsupportedTokenStandard();
        }

        // End the auction
        auction.settled = true;
        emit AuctionSettled(auctionId, winner, auction.beneficiary, auction.latestBid);
    }

    /// @dev Get the balance for an address.
    function getBalance(address _address) external view returns (uint256) {
        return _balances[_address];
    }

    /// @dev Withdraw user balance in case automatic refund in bid failed.
    function withdraw() external {
        uint256 amount = _balances[msg.sender];
        if (amount == 0) {
            revert NoBalanceToWithdraw();
        }

        // Set balance to zero because it could be called again in receive before call returns
        _balances[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) {
            _balances[msg.sender] = amount;
        }
    }

    /// @dev Decode auction parameters from token transfer data
    /// @param data Encoded auction parameters: address beneficiary (20 bytes)
    function _decodeAuctionParams(bytes memory data) internal view returns (address payable beneficiary) {
        // First 20 bytes are the beneficiary address
        beneficiary = payable(abi.decode(data, (address)));

        if (beneficiary == address(0)) {
            beneficiary = payable(msg.sender);
        }
    }

    /// @dev Calculate the minimum bid based on current network conditions (based on VV Mint prices)
    function _getMinimumBid() internal view returns (uint256) {
        return block.basefee * 60_000;
    }

    /// @dev Initializes an auction
    function _initializeAuction(
        address tokenContract,
        uint256 tokenId,
        uint16 tokenERCStandard,
        address tokenOwner,
        uint8 tokenAmount,
        address payable beneficiary
    ) internal {
        _auctions[nextAuctionId] = Auction(
            tokenContract,
            tokenId,
            tokenOwner,
            0, // no bid has been placed
            uint32(block.timestamp + 24 hours),
            tokenERCStandard,
            tokenAmount,
            false,
            beneficiary
        );

        emit AuctionInitialised(
            nextAuctionId,
            tokenContract,
            tokenId,
            beneficiary,
            uint32(block.timestamp + 24 hours)
        );

        nextAuctionId++;
    }

    /// @dev Extends the end time of an auction if we are within the grace period.
    function _maybeExtendTime(uint64 auctionId, Auction storage auction) internal {
        uint64 gracePeriodStart = auction.endTimestamp - BIDDING_GRACE_PERIOD;
        uint64 _now = uint64(block.timestamp);
        if (_now > gracePeriodStart) {
            auction.endTimestamp = uint32(_now + BIDDING_GRACE_PERIOD);
            emit AuctionExtended(auctionId, auction.endTimestamp);
        }
    }

    /// @dev Whether an auction has an existing bid
    function _hasBid(Auction memory auction) internal pure returns (bool) {
        return auction.latestBid > 0;
    }

    /// @dev Calculates the minimum price for the next bid
    function _currentBidPrice(Auction memory auction) internal view returns (uint256) {
        if (!_hasBid(auction)) {
            return _getMinimumBid();
        }

        uint256 percentageIncreasePrice = uint256(auction.latestBid) * (100 + BID_PERCENTAGE_INCREASE) / 100;
        uint256 minimumBid = _getMinimumBid();

        return percentageIncreasePrice < minimumBid ?
            minimumBid :
            percentageIncreasePrice;
    }
}
