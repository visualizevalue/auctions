import { parseAbi } from 'viem'

export const AUCTIONS_ABI = parseAbi([
  'error AuctionAlreadySettled()',
  'error AuctionDoesNotExist()',
  'error AuctionNotActive()',
  'error AuctionNotComplete()',
  'error FailedWithdrawal()',
  'error MinimumBidNotMet()',
  'error NoBalanceToWithdraw()',
  'error TooManyTokens()',
  'event AuctionExtended(uint256 indexed auctionId, uint256 indexed endTimestamp)',
  'event AuctionInitialised(uint256 indexed auctionId, address indexed tokenContract, uint256 indexed tokenId, uint16 tokenERCStandard, uint40 endTimestamp, address beneficiary)',
  'event AuctionSettled(uint256 indexed auctionId, address indexed winner, address indexed beneficiary, uint256 amount)',
  'event Bid(uint256 indexed auctionId, uint256 indexed bid, address indexed from)',
  'function AUCTION_DURATION() view returns (uint40)',
  'function BIDDING_GRACE_PERIOD() view returns (uint40)',
  'function BID_PERCENTAGE_INCREASE() view returns (uint256)',
  'function MAX_BID_INCREASE() view returns (uint256)',
  'function auctionId() view returns (uint256)',
  'function auctions(uint256) view returns (address tokenContract, uint256 tokenId, uint80 tokenAmount, uint16 tokenStandard, uint40 endTimestamp, bool settled, uint112 latestBid, address latestBidder, address beneficiary)',
  'function balances(address) view returns (uint256)',
  'function bid(uint256 id) payable',
  'function currentBidPrice(uint256 id) view returns (uint256)',
  'function onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4)',
  'function onERC1155Received(address, address from, uint256 id, uint256 value, bytes data) returns (bytes4)',
  'function onERC721Received(address, address from, uint256 tokenId, bytes data) returns (bytes4)',
  'function settle(uint256 id)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function withdraw()'
])

export const ERC721_ABI = parseAbi([
  'error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner)',
  'error ERC721InsufficientApproval(address operator, uint256 tokenId)',
  'error ERC721InvalidApprover(address approver)',
  'error ERC721InvalidOperator(address operator)',
  'error ERC721InvalidOwner(address owner)',
  'error ERC721InvalidReceiver(address receiver)',
  'error ERC721InvalidSender(address sender)',
  'error ERC721NonexistentToken(uint256 tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function approve(address to, uint256 tokenId)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function name() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function symbol() view returns (string)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function transferFrom(address from, address to, uint256 tokenId)'
])

export const ERC1155_ABI = parseAbi([
  'error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)',
  'error ERC1155InvalidApprover(address approver)',
  'error ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength)',
  'error ERC1155InvalidOperator(address operator)',
  'error ERC1155InvalidReceiver(address receiver)',
  'error ERC1155InvalidSender(address sender)',
  'error ERC1155MissingApprovalForAll(address operator, address owner)',
  'event ApprovalForAll(address indexed account, address indexed operator, bool approved)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event URI(string value, uint256 indexed id)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] values, bytes data)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function uri(uint256) view returns (string)'
])

