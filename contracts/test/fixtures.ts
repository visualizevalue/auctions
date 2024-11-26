import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import hre from 'hardhat'
import AuctionsModule from '../ignition/modules/Auctions'

export async function baseFixture() {
  const [owner, bidder1, bidder2, recipient] = await hre.viem.getWalletClients()
  const publicClient = await hre.viem.getPublicClient()

  // Deploy mock ERC721 and ERC1155 contracts
  const mockERC721 = await hre.viem.deployContract('MockERC721')
  const mockERC1155 = await hre.viem.deployContract('MockERC1155')

  // Deploy Auctions contract
  const { auctions } = await hre.ignition.deploy(AuctionsModule)

  // Mint some tokens to owner
  await mockERC721.write.mint([owner.account.address, 1n])
  await mockERC1155.write.mint([owner.account.address, 1n, 10n, "0x"])

  // Approve auction contract
  await mockERC721.write.setApprovalForAll([auctions.address, true])
  await mockERC1155.write.setApprovalForAll([auctions.address, true])

  // Add helper for auctions contract
  const getAuction = async (id: bigint) => {
    const [
      tokenContract,
      tokenId,
      tokenAmount,
      tokenERCStandard,
      endTimestamp,
      settled,
      latestBid,
      latestBidder,
      beneficiary,
    ] = await auctions.read.auctions([id])

    return {
      tokenContract,
      tokenId,
      tokenAmount,
      tokenERCStandard,
      endTimestamp,
      settled,
      latestBid,
      latestBidder,
      beneficiary,
    }
  }

  return {
    auctions,
    mockERC721,
    mockERC1155,
    owner,
    bidder1,
    bidder2,
    recipient,
    publicClient,
    getAuction,
  }
}
