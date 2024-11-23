import { parseEther, zeroAddress, getAddress } from 'viem'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import { time } from "@nomicfoundation/hardhat-network-helpers"

describe.skip('Auctions', function () {
  async function baseFixture() {
    const [owner, bidder1, bidder2, recipient] = await hre.viem.getWalletClients()
    const publicClient = await hre.viem.getPublicClient()

    // Deploy mock ERC721 and ERC1155 contracts
    const mockERC721 = await hre.viem.deployContract('MockERC721')
    const mockERC1155 = await hre.viem.deployContract('MockERC1155')

    // Deploy Auctions contract
    const auctions = await hre.viem.deployContract('Auctions')

    // Mint some tokens to owner
    await mockERC721.write.mint([owner.account.address, 1n])
    await mockERC1155.write.mint([owner.account.address, 1n, 10n, "0x"])

    // Approve auction contract
    await mockERC721.write.setApprovalForAll([auctions.address, true])
    await mockERC1155.write.setApprovalForAll([auctions.address, true])

    return {
      auctions,
      mockERC721,
      mockERC1155,
      owner,
      bidder1,
      bidder2,
      recipient,
      publicClient
    }
  }

  describe('Constants', function () {
    it('has correct grace period', async function () {
      const { auctions } = await loadFixture(baseFixture)
      expect(await auctions.read.BIDDING_GRACE_PERIOD()).to.equal(15 * 60) // 15 minutes
    })

    it('has correct bid percentage increase', async function () {
      const { auctions } = await loadFixture(baseFixture)
      expect(await auctions.read.BID_PERCENTAGE_INCREASE()).to.equal(10)
    })
  })

  describe('ERC721 Auctions', function () {
    it('creates auction via direct method', async function () {
      const { auctions, mockERC721, owner, recipient } = await loadFixture(baseFixture)

      await expect(auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])).to.emit(auctions, 'AuctionInitialised')

      const auction = await auctions.read.getAuction([0n])
      expect(auction[0]).to.equal(mockERC721.address) // tokenContract
      expect(auction[1]).to.equal(1n) // tokenId
      expect(auction[5]).to.equal(721) // tokenERCStandard
    })

    it('creates auction via token transfer', async function () {
      const { auctions, mockERC721, recipient } = await loadFixture(baseFixture)

      const data = `0x${recipient.account.address.slice(2).padEnd(40, '0')}`
      await expect(mockERC721.write.safeTransferFrom([
        mockERC721.address,
        auctions.address,
        1n,
        data
      ])).to.emit(auctions, 'AuctionInitialised')
    })

    it('prevents creation with invalid recipient', async function () {
      const { auctions, mockERC721 } = await loadFixture(baseFixture)

      await expect(auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        zeroAddress
      ])).to.be.revertedWithCustomError(auctions, 'InvalidRecipient')
    })
  })

  describe('ERC1155 Auctions', function () {
    it('creates auction via direct method', async function () {
      const { auctions, mockERC1155, recipient } = await loadFixture(baseFixture)

      await expect(auctions.write.createERC1155Auction([
        mockERC1155.address,
        1n,
        5,
        recipient.account.address
      ])).to.emit(auctions, 'AuctionInitialised')

      const auction = await auctions.read.getAuction([0n])
      expect(auction[0]).to.equal(mockERC1155.address) // tokenContract
      expect(auction[1]).to.equal(1n) // tokenId
      expect(auction[5]).to.equal(1155) // tokenERCStandard
      expect(auction[6]).to.equal(5) // tokenAmount
    })

    it('prevents auction with too many tokens', async function () {
      const { auctions, mockERC1155, recipient } = await loadFixture(baseFixture)

      await expect(auctions.write.createERC1155Auction([
        mockERC1155.address,
        1n,
        256,
        recipient.account.address
      ])).to.be.revertedWithCustomError(auctions, 'TooManyTokens')
    })
  })

  describe('Bidding', function () {
    it('accepts valid first bid', async function () {
      const { auctions, mockERC721, recipient, bidder1 } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      const minBid = await auctions.read.currentBidPrice([0n])
      await expect(auctions.write.bid([0n], { value: minBid }))
        .to.emit(auctions, 'Bid')
        .withArgs(0n, minBid, bidder1.account.address)
    })

    it('requires minimum bid increase', async function () {
      const { auctions, mockERC721, recipient, bidder1 } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      const minBid = await auctions.read.currentBidPrice([0n])
      await auctions.write.bid([0n], { value: minBid })

      await expect(auctions.write.bid([0n], { value: minBid }))
        .to.be.revertedWithCustomError(auctions, 'MinimumBidNotMet')
    })

    it('extends auction during grace period', async function () {
      const { auctions, mockERC721, recipient, bidder1, bidder2 } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      const minBid = await auctions.read.currentBidPrice([0n])
      await auctions.write.bid([0n], { value: minBid })

      // Fast forward to near end
      const auction = await auctions.read.getAuction([0n])
      await time.increaseTo(auction[4] - 60) // 1 minute before end

      // New bid should extend auction
      await expect(auctions.write.bid([0n], { value: minBid * 2n }))
        .to.emit(auctions, 'AuctionExtended')
    })

    it('refunds previous bidder', async function () {
      const { auctions, mockERC721, recipient, bidder1, bidder2 } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      const minBid = await auctions.read.currentBidPrice([0n])
      await auctions.write.bid([0n], { value: minBid })

      const bidder1BalanceBefore = await hre.viem.getBalance(bidder1.account.address)

      // New higher bid
      await auctions.write.bid([0n], { value: minBid * 2n })

      const bidder1BalanceAfter = await hre.viem.getBalance(bidder1.account.address)
      expect(bidder1BalanceAfter - bidder1BalanceBefore).to.be.approximately(minBid)
    })
  })

  describe('Settlement', function () {
    it('settles auction with winning bid', async function () {
      const { auctions, mockERC721, recipient, bidder1 } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      const minBid = await auctions.read.currentBidPrice([0n])
      await auctions.write.bid([0n], { value: minBid })

      // Fast forward past end time
      const auction = await auctions.read.getAuction([0n])
      await time.increaseTo(auction[4] + 1)

      await expect(auctions.write.settle([0n]))
        .to.emit(auctions, 'AuctionSettled')
        .withArgs(0n, bidder1.account.address, recipient.account.address, minBid)

      // Check NFT transfer
      expect(await mockERC721.read.ownerOf([1n])).to.equal(getAddress(bidder1.account.address))
    })

    it('settles auction with no bids', async function () {
      const { auctions, mockERC721, owner, recipient } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      // Fast forward past end time
      const auction = await auctions.read.getAuction([0n])
      await time.increaseTo(auction[4] + 1)

      await expect(auctions.write.settle([0n]))
        .to.emit(auctions, 'AuctionSettled')
        .withArgs(0n, owner.account.address, recipient.account.address, 0n)

      // Check NFT returned to original owner
      expect(await mockERC721.read.ownerOf([1n])).to.equal(getAddress(owner.account.address))
    })

    it('prevents early settlement', async function () {
      const { auctions, mockERC721, recipient } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      await expect(auctions.write.settle([0n]))
        .to.be.revertedWithCustomError(auctions, 'AuctionNotComplete')
    })

    it('prevents double settlement', async function () {
      const { auctions, mockERC721, recipient } = await loadFixture(baseFixture)

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      // Fast forward past end time
      const auction = await auctions.read.getAuction([0n])
      await time.increaseTo(auction[4] + 1)

      await auctions.write.settle([0n])
      await expect(auctions.write.settle([0n]))
        .to.be.revertedWithCustomError(auctions, 'AuctionAlreadySettled')
    })
  })

  describe('Balance Management', function () {
    it('allows withdrawal of failed refunds', async function () {
      const { auctions, mockERC721, recipient, bidder1 } = await loadFixture(baseFixture)

      // Create mock contract that rejects ETH
      const mockNoReceive = await hre.viem.deployContract('MockNoReceive')

      await auctions.write.createERC721Auction([
        mockERC721.address,
        1n,
        recipient.account.address
      ])

      const minBid = await auctions.read.currentBidPrice([0n])
      await auctions.write.bid([0n], { account: mockNoReceive.address, value: minBid })

      // New bid should cause failed refund
      await auctions.write.bid([0n], { value: minBid * 2n })

      // Check balance is recorded
      expect(await auctions.read.getBalance([mockNoReceive.address])).to.equal(minBid)
    })

    it('prevents withdrawal with no balance', async function () {
      const { auctions } = await loadFixture(baseFixture)

      await expect(auctions.write.withdraw())
        .to.be.revertedWithCustomError(auctions, 'NoBalanceToWithdraw')
    })
  })
})
