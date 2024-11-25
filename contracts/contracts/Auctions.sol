// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

struct Auction {
    address tokenContract;
    uint256 tokenId;
    uint80  tokenAmount;
    uint8   tokenStandard;
    uint48  endTimestamp;
    bool    settled;
    uint112 latestBid;
    address latestBidder;
    address payable beneficiary;
}

contract Auctions is
    ERC721Holder,
    ERC1155Holder,
    ReentrancyGuard
{
    /// @notice The auctions are all one day (+ variable bid grace period increments).
    uint48 public constant AUCTION_DURATION = 24 hours;

    /// @notice Minimum auction duration after a bid in seconds (5 minutes).
    uint48 public constant BIDDING_GRACE_PERIOD = 5 minutes;

    /// @notice Each bid has to increase by at least 10%
    uint256 public constant BID_PERCENTAGE_INCREASE = 10;

    /// @notice Mininum bid increases should be capped at 1 Ether.
    uint256 public constant MAX_BID_INCREASE = 1 ether;

    /// @notice The next auction ID
    uint64 public auctionId;

    /// @dev Each auction is identified by an ID
    mapping(uint256 => Auction) private _auctions;

    /// @dev When the automatic refunds of previous bids fail, they are stored in here
    mapping(address => uint256) private _balances;

    /// @dev Emitted when an NFT is sent to the contract.
    event AuctionInitialised(
        uint64  indexed auctionId,
        address indexed tokenContract,
        uint256 indexed tokenId,
        uint16  tokenERCStandard,
        uint48  endTimestamp,
        address beneficiary
    );

    /// @dev Emitted when a new bid is entered.
    event Bid(uint64 indexed auctionId, uint256 indexed bid, address indexed from);

    /// @dev Emitted when a new bid is entered within the BIDDING_GRACE_PERIOD.
    event AuctionExtended(uint64 indexed auctionId, uint256 indexed endTimestamp);

    /// @dev Emitted when an auction is settled, the NFT is sent
    //       to the winner and the funds sent to the beneficiary.
    event AuctionSettled(
        uint64  indexed auctionId,
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
        address tokenContract = msg.sender;

        _initializeAuction(
            tokenContract,
            tokenId,
            1,
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
        if (value >= 256) {
            revert TooManyTokens();
        }

        address tokenContract = msg.sender;

        _initializeAuction(
            tokenContract,  // token contract address
            id,
            2,
            uint80(value),
            _getBeneficiary(data, from)
        );

        return this.onERC1155Received.selector;
    }

    /// @dev Get an Auction by its ID
    function getAuction(uint64 id)
        public
        view
        returns (
            address tokenContract,
            uint256 tokenId,
            uint80  tokenAmount,
            uint16  tokenERCStandard,
            uint48  endTimestamp,
            bool    settled,
            uint112 latestBid,
            address latestBidder,
            address beneficiary
        )
    {
        Auction memory auction = _auctions[id];
        return (
            auction.tokenContract,
            auction.tokenId,
            auction.tokenAmount,
            _getERCStandard(auction.tokenStandard),
            auction.endTimestamp,
            auction.settled,
            auction.latestBid,
            auction.latestBidder,
            auction.beneficiary
        );
    }

    /// @dev The minimum value of the next bid for an auction.
    function currentBidPrice(uint64 id) external view returns (uint256) {
        return _currentBidPrice(_auctions[id]);
    }

    /// @dev Enter a new bid
    /// @param id The Auction ID to bid on
    function bid(uint64 id) external payable nonReentrant {
        Auction storage auction = _auctions[id];
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

        _maybeExtendTime(id, auction);

        // Store the bid
        auction.latestBid = uint112(bidValue);
        auction.latestBidder = bidder;

        emit Bid(id, bidValue, bidder);
    }

    /// @dev Settles an auction
    /// @param id The Auction ID to claim.
    function settle(uint64 id) external {
        Auction storage auction = _auctions[id];
        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.endTimestamp == 0) revert AuctionDoesNotExist();
        if (block.timestamp <= auction.endTimestamp) revert AuctionNotComplete();

        address winner = _hasBid(auction) ? auction.latestBidder : auction.beneficiary;

        // Send the funds to the beneficiary if there was a bid
        if (_hasBid(auction)) {
            (bool success,) = auction.beneficiary.call{value: auction.latestBid}("");
            if (!success) {
                _balances[auction.beneficiary] += auction.latestBid;
            }
        }

        // Transfer the NFT to the winner
        if (auction.tokenStandard == 1) {
            IERC721(auction.tokenContract).safeTransferFrom(
                address(this),
                winner,
                auction.tokenId,
                ""
            );
        } else if (auction.tokenStandard == 2) {
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
        emit AuctionSettled(id, winner, auction.beneficiary, auction.latestBid);
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
    function _getBeneficiary(bytes memory data, address defaultBeneficiary) internal pure returns (address payable) {
        // First 20 bytes are the beneficiary address
        address beneficiary = abi.decode(data, (address));

        if (beneficiary == address(0)) {
          beneficiary = defaultBeneficiary;
        }

        return payable(beneficiary);
    }

    /// @dev Initializes an auction
    function _initializeAuction(
        address tokenContract,
        uint256 tokenId,
        uint8   tokenStandard,
        uint80  tokenAmount,
        address payable beneficiary
    ) internal {
        auctionId++;

        uint48 endTimestamp = uint48(block.timestamp + AUCTION_DURATION);

        Auction storage auction = _auctions[auctionId];

        auction.tokenContract = tokenContract;
        auction.tokenId =       tokenId;
        auction.tokenAmount =   tokenAmount;
        auction.tokenStandard = tokenStandard;
        auction.endTimestamp =  endTimestamp;
        auction.beneficiary =   beneficiary;

        emit AuctionInitialised(
            auctionId,
            tokenContract,
            tokenId,
            _getERCStandard(tokenStandard),
            endTimestamp,
            beneficiary
        );
    }

    /// @dev Extends the end time of an auction if we are within the grace period.
    function _maybeExtendTime(uint64 id, Auction storage auction) internal {
        uint64 gracePeriodStart = auction.endTimestamp - BIDDING_GRACE_PERIOD;
        uint64 _now = uint64(block.timestamp);
        if (_now > gracePeriodStart) {
            auction.endTimestamp = uint48(_now + BIDDING_GRACE_PERIOD);
            emit AuctionExtended(id, auction.endTimestamp);
        }
    }

    /// @dev Parses the token standard to their ERC identifier.
    function _getERCStandard(uint8 standard) internal pure returns (uint16) {
        if (standard == 1) return 721;
        if (standard == 2) return 1155;

        revert UnsupportedTokenStandard();
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

