// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Auctions is ERC721Holder, ERC1155Holder {
    /// @notice The data struct for a given auction.
    struct Auction {
        address tokenContract;
        uint256 tokenId;
        uint80  tokenAmount;
        uint16  tokenStandard;
        uint40  endTimestamp;
        bool    settled;
        uint112 latestBid;
        address latestBidder;
        address payable beneficiary;
    }

    /// @notice The auctions are all one day (+ variable bid grace period increments).
    uint40 public immutable AUCTION_DURATION = 24 hours;

    /// @notice Minimum auction duration after a bid in seconds (5 minutes).
    uint40 public immutable BIDDING_GRACE_PERIOD = 5 minutes;

    /// @notice Each bid has to increase by at least 10%
    uint256 public immutable BID_PERCENTAGE_INCREASE = 10;

    /// @notice Mininum bid increases should be capped at 1 Ether.
    uint256 public immutable MAX_BID_INCREASE = 1 ether;

    /// @notice The next auction ID
    uint256 public auctionId;

    /// @dev Each auction is identified by an ID
    mapping(uint256 => Auction) public auctions;

    /// @dev When the automatic refunds of previous bids fail, they are stored in here
    mapping(address => uint256) public balances;

    /// @dev Emitted when an NFT is sent to the contract.
    event AuctionInitialised(
        uint256 indexed auctionId,
        address indexed tokenContract,
        uint256 indexed tokenId,
        uint16  tokenERCStandard,
        uint40  endTimestamp,
        address beneficiary
    );

    /// @dev Emitted when a new bid is entered.
    event Bid(uint256 indexed auctionId, uint256 indexed bid, address indexed from);

    /// @dev Emitted when a new bid is entered within the BIDDING_GRACE_PERIOD.
    event AuctionExtended(uint256 indexed auctionId, uint256 indexed endTimestamp);

    /// @dev Emitted when an auction is settled, the NFT is sent
    //       to the winner and the funds sent to the beneficiary.
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        address indexed beneficiary,
        uint256 amount
    );

    error AuctionNotActive();
    error AuctionAlreadySettled();
    error AuctionDoesNotExist();
    error AuctionNotComplete();
    error FailedWithdrawal();
    error MinimumBidNotMet();
    error NoBalanceToWithdraw();
    error TooManyTokens();

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
        address tokenContract = msg.sender;

        _initializeAuction(
            tokenContract,
            tokenId,
            721,
            1,
            _getBeneficiary(data, from)
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
        if (value >= type(uint80).max) revert TooManyTokens();

        address tokenContract = msg.sender;

        _initializeAuction(
            tokenContract,
            id,
            1155,
            uint80(value),
            _getBeneficiary(data, from)
        );

        return this.onERC1155Received.selector;
    }

    /// @dev The minimum value of the next bid for an auction.
    function currentBidPrice(uint256 id) external view returns (uint256) {
        return _currentBidPrice(auctions[id]);
    }

    /// @dev Enter a new bid
    /// @param id The Auction ID to bid on
    function bid(uint256 id) external payable {
        Auction storage auction = auctions[id];

        address previousBidder = auction.latestBidder;
        uint256 previousBid    = auction.latestBid;
        uint256 bidValue       = msg.value;
        address bidder         = msg.sender;

        if (bidValue < _currentBidPrice(auction)) revert MinimumBidNotMet();
        if (block.timestamp > auction.endTimestamp) revert AuctionNotActive();

        _maybeExtendTime(id, auction);

        // Store the bid
        auction.latestBid    = uint112(bidValue);
        auction.latestBidder = bidder;

        // Pay back previous bidder
        if (_hasBid(auction)) {
            (bool success,) = payable(previousBidder).call{value: previousBid}("");
            if (!success) {
                balances[previousBidder] += previousBid;
            }
        }

        emit Bid(id, bidValue, bidder);
    }

    /// @dev Settles an auction
    /// @param id The Auction ID to claim.
    function settle(uint256 id) external {
        Auction storage auction = auctions[id];
        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (block.timestamp <= auction.endTimestamp) revert AuctionNotComplete();

        address winner = _hasBid(auction) ? auction.latestBidder : auction.beneficiary;
        auction.settled = true;

        // Send the funds to the beneficiary if there was a bid
        if (_hasBid(auction)) {
            (bool success,) = auction.beneficiary.call{value: auction.latestBid}("");
            if (!success) {
                balances[auction.beneficiary] += auction.latestBid;
            }
        }

        // Transfer the NFT to the winner
        if (auction.tokenStandard == 721) {
            IERC721(auction.tokenContract).safeTransferFrom(
                address(this),
                winner,
                auction.tokenId,
                ""
            );
        } else if (auction.tokenStandard == 1155) {
            IERC1155(auction.tokenContract).safeTransferFrom(
                address(this),
                winner,
                auction.tokenId,
                auction.tokenAmount,
                ""
            );
        }

        emit AuctionSettled(id, winner, auction.beneficiary, auction.latestBid);
    }

    /// @dev Withdraw user balance in case automatic refund in bid failed.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        if (amount == 0) {
            revert NoBalanceToWithdraw();
        }

        // Set balance to zero because it could be called again in receive before call returns
        balances[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert FailedWithdrawal();
    }

    /// @dev Decode auction parameters from token transfer data
    /// @param data Encoded auction parameters: address beneficiary (20 bytes)
    function _getBeneficiary(bytes memory data, address defaultBeneficiary) internal pure returns (address payable) {
        if (data.length == 32) {
            address beneficiary = abi.decode(data, (address));

            if (beneficiary != address(0)) {
                return payable(beneficiary);
            }
        }

        return payable(defaultBeneficiary);
    }

    /// @dev Initializes an auction
    function _initializeAuction(
        address tokenContract,
        uint256 tokenId,
        uint16  tokenStandard,
        uint80  tokenAmount,
        address payable beneficiary
    ) internal {
        auctionId++;

        uint40 endTimestamp = uint40(block.timestamp + AUCTION_DURATION);

        Auction storage auction = auctions[auctionId];

        auction.tokenContract = tokenContract;
        auction.tokenId       = tokenId;
        auction.tokenAmount   = tokenAmount;
        auction.tokenStandard = tokenStandard;
        auction.endTimestamp  = endTimestamp;
        auction.beneficiary   = beneficiary;

        emit AuctionInitialised(
            auctionId,
            tokenContract,
            tokenId,
            tokenStandard,
            endTimestamp,
            beneficiary
        );
    }

    /// @dev Extends the end time of an auction if we are within the grace period.
    function _maybeExtendTime(uint256 id, Auction storage auction) internal {
        uint40 gracePeriodStart = auction.endTimestamp - BIDDING_GRACE_PERIOD;
        uint40 _now = uint40(block.timestamp);
        if (_now > gracePeriodStart) {
            auction.endTimestamp = _now + BIDDING_GRACE_PERIOD;
            emit AuctionExtended(id, auction.endTimestamp);
        }
    }

    /// @dev Calculates the minimum price for the next bid
    function _currentBidPrice(Auction memory auction) internal view returns (uint256) {
        if (!_hasBid(auction)) return _getMinimumBid();

        uint256 latestBid = uint256(auction.latestBid);
        uint256 percentageIncrease = latestBid * BID_PERCENTAGE_INCREASE / 100;

        uint256 increase = percentageIncrease < MAX_BID_INCREASE
            ? percentageIncrease
            : MAX_BID_INCREASE;

        return latestBid + increase;
    }

    /// @dev Whether an auction has an existing bid
    function _hasBid(Auction memory auction) internal pure returns (bool) {
        return auction.latestBid > 0;
    }

    /// @dev Calculate the minimum bid based on current network conditions (based on VV Mint prices)
    function _getMinimumBid() internal view returns (uint256) {
        return block.basefee * 60_000;
    }
}

