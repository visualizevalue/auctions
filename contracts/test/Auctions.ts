import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { parseEther, zeroAddress, getAddress, encodeAbiParameters } from 'viem'
import { expect } from 'chai'
import hre from 'hardhat'
import { baseFixture } from './fixtures'

describe('Auctions', function () {
  describe('Constants', function () {
    it('has correct auction duration', async function () {
      const { auctions } = await loadFixture(baseFixture)
      expect(await auctions.read.AUCTION_DURATION()).to.equal(24 * 60 * 60) // 24 hours
    })

    it('has correct grace period', async function () {
      const { auctions } = await loadFixture(baseFixture)
      expect(await auctions.read.BIDDING_GRACE_PERIOD()).to.equal(5 * 60) // 5 minutes
    })

    it('has correct bid percentage increase', async function () {
      const { auctions } = await loadFixture(baseFixture)
      expect(await auctions.read.BID_PERCENTAGE_INCREASE()).to.equal(10)
    })

    it('has correct maximum bid increase', async function () {
      const { auctions } = await loadFixture(baseFixture)
      expect(await auctions.read.MAX_BID_INCREASE()).to.equal(parseEther('1'))
    })
  })

  describe('ERC721 Auctions', function () {
    it('initializes auction when ERC721 token is received', async function () {
      const { auctions, mockERC721, owner, publicClient } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const auctionId = await auctions.read.auctionId()
      expect(auctionId).to.equal(1n)

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
      ] = await auctions.read.getAuction([1n])

      const block = await publicClient.getBlock()
      const expectedEndTime = block.timestamp + 24n * 60n * 60n

      expect(tokenContract).to.equal(getAddress(mockERC721.address))
      expect(tokenId).to.equal(1n)
      expect(tokenAmount).to.equal(1n)
      expect(tokenERCStandard).to.equal(721n)
      expect(endTimestamp).to.equal(expectedEndTime)
      expect(settled).to.equal(false)
      expect(latestBid).to.equal(0n)
      expect(latestBidder).to.equal(zeroAddress)
      expect(beneficiary).to.equal(getAddress(owner.account.address))
    })

    it('allows custom beneficiary for ERC721 auction', async function () {
      const { auctions, mockERC721, owner, recipient } = await loadFixture(baseFixture)

      const beneficiaryData = encodeAbiParameters(
        [ { type: 'address', name: 'beneficiary' } ],
        [ recipient.account.address ],
      )
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        beneficiaryData
      ])

      const auction = await auctions.read.getAuction([1n])
      const [
        _tokenContract,
        _tokenId,
        _tokenAmount,
        _tokenERCStandard,
        _endTimestamp,
        _settled,
        _latestBid,
        _latestBidder,
        beneficiary,
      ] = await auctions.read.getAuction([1n])

      expect(beneficiary).to.equal(getAddress(recipient.account.address))
    })
  })

  describe.skip('ERC1155 Auctions', function () {
    it('initializes auction when ERC1155 tokens are received', async function () {
      const { auctions, mockERC1155, owner } = await loadFixture(baseFixture)

      await mockERC1155.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        5n,
        '0x'
      ])

      const auction = await auctions.read.getAuction([1n])
      expect(auction.tokenContract).to.equal(getAddress(mockERC1155.address))
      expect(auction.tokenId).to.equal(1n)
      expect(auction.tokenAmount).to.equal(5n)
      expect(auction.tokenERCStandard).to.equal(1155n)
    })

    it('reverts when too many ERC1155 tokens are transferred', async function () {
      const { auctions, mockERC1155, owner } = await loadFixture(baseFixture)

      const maxTokens = BigInt(2 ** 80)
      await mockERC1155.write.mint([owner.account.address, 1n, maxTokens, "0x"])

      await expect(
        mockERC1155.write.safeTransferFrom([
          owner.account.address,
          auctions.address,
          1n,
          maxTokens,
          '0x'
        ])
      ).to.be.rejectedWith('TooManyTokens')
    })
  })

  describe.skip('Bidding', function () {
    it('allows valid bid', async function () {
      const { auctions, mockERC721, owner, bidder1 } = await loadFixture(baseFixture)

      // Create auction
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const minBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { value: minBid })

      const auction = await auctions.read.getAuction([1n])
      expect(auction.latestBid).to.equal(minBid)
    })

    it('rejects bid below minimum', async function () {
      const { auctions, mockERC721, owner } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const minBid = await auctions.read.currentBidPrice([1n])
      await expect(
        auctions.write.bid([1n], { value: minBid - 1n })
      ).to.be.rejectedWith('MinimumBidNotMet')
    })

    it('extends auction time during grace period', async function () {
      const { auctions, mockERC721, owner, bidder1 } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const minBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { value: minBid })

      // Fast forward to grace period
      const auction = await auctions.read.getAuction([1n])
      await time.increaseTo(auction.endTimestamp - BigInt(4 * 60)) // 4 minutes before end

      // Place new bid
      const newBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { value: newBid })

      // Check auction was extended
      const updatedAuction = await auctions.read.getAuction([1n])
      expect(updatedAuction.endTimestamp).to.be.greaterThan(auction.endTimestamp)
    })

    it('refunds previous bidder', async function () {
      const { auctions, mockERC721, owner, bidder1, bidder2 } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      // First bid
      const minBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { account: bidder1.account, value: minBid })

      const bidder1InitialBalance = await hre.viem.getBalance(bidder1.account.address)

      // Second bid
      const newBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { account: bidder2.account, value: newBid })

      const bidder1FinalBalance = await hre.viem.getBalance(bidder1.account.address)
      expect(bidder1FinalBalance).to.equal(bidder1InitialBalance + minBid)
    })
  })

  describe.skip('Settlement', function () {
    it('settles auction with winner', async function () {
      const { auctions, mockERC721, owner, bidder1 } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const minBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { account: bidder1.account, value: minBid })

      // Fast forward past end time
      await time.increase(24 * 60 * 60 + 1)

      // Settle auction
      await auctions.write.settle([1n])

      // Check NFT transferred to winner
      expect(await mockERC721.read.ownerOf([1n])).to.equal(getAddress(bidder1.account.address))
    })

    it('returns NFT to beneficiary if no bids', async function () {
      const { auctions, mockERC721, owner } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      // Fast forward past end time
      await time.increase(24 * 60 * 60 + 1)

      // Settle auction
      await auctions.write.settle([1n])

      // Check NFT returned to owner
      expect(await mockERC721.read.ownerOf([1n])).to.equal(getAddress(owner.account.address))
    })

    it('prevents settling auction twice', async function () {
      const { auctions, mockERC721, owner } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await time.increase(24 * 60 * 60 + 1)
      await auctions.write.settle([1n])

      await expect(
        auctions.write.settle([1n])
      ).to.be.rejectedWith('AuctionAlreadySettled')
    })

    it('prevents settling before end time', async function () {
      const { auctions, mockERC721, owner } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await expect(
        auctions.write.settle([1n])
      ).to.be.rejectedWith('AuctionNotComplete')
    })
  })

  describe.skip('Balance Management', function () {
    it('allows withdrawal of failed refunds', async function () {
      const { auctions, mockERC721, owner, bidder1 } = await loadFixture(baseFixture)

      // Create auction and place bid
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const minBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { account: bidder1.account, value: minBid })

      // Check balance can be withdrawn
      const balance = await auctions.read.getBalance([bidder1.account.address])
      if (balance > 0n) {
        const initialBalance = await hre.viem.getBalance(bidder1.account.address)
        await auctions.write.withdraw({ account: bidder1.account })
        const finalBalance = await hre.viem.getBalance(bidder1.account.address)
        expect(finalBalance).to.be.greaterThan(initialBalance)
      }
    })

    it('prevents withdrawal with zero balance', async function () {
      const { auctions, bidder1 } = await loadFixture(baseFixture)

      await expect(
        auctions.write.withdraw({ account: bidder1.account })
      ).to.be.rejectedWith('NoBalanceToWithdraw')
    })
  })
})
