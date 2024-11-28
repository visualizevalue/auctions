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
      const { auctions, mockERC721, owner, publicClient, getAuction } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const auctionId = await auctions.read.auctionId()
      expect(auctionId).to.equal(1n)

      const auction = await getAuction(1n)

      const block = await publicClient.getBlock()
      const expectedEndTime = block.timestamp + 24n * 60n * 60n

      expect(auction.tokenContract).to.equal(getAddress(mockERC721.address))
      expect(auction.tokenId).to.equal(1n)
      expect(auction.tokenAmount).to.equal(1n)
      expect(auction.tokenERCStandard).to.equal(721n)
      expect(auction.endTimestamp).to.equal(expectedEndTime)
      expect(auction.settled).to.equal(false)
      expect(auction.latestBid).to.equal(0n)
      expect(auction.latestBidder).to.equal(zeroAddress)
      expect(auction.beneficiary).to.equal(getAddress(owner.account.address))
    })

    it('allows custom beneficiary for ERC721 auction', async function () {
      const { auctions, mockERC721, owner, recipient, getAuction } = await loadFixture(baseFixture)

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

      const { beneficiary } = await getAuction(1n)

      expect(beneficiary).to.equal(getAddress(recipient.account.address))
    })
  })

  describe('ERC1155 Auctions', function () {
    it('initializes auction when ERC1155 tokens are received', async function () {
      const { auctions, mockERC1155, owner, publicClient, getAuction } = await loadFixture(baseFixture)

      await mockERC1155.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        5n,
        '0x'
      ])

      const auction = await getAuction(1n)

      const block = await publicClient.getBlock()
      const expectedEndTime = block.timestamp + 24n * 60n * 60n

      expect(auction.tokenContract).to.equal(getAddress(mockERC1155.address))
      expect(auction.tokenId).to.equal(1n)
      expect(auction.tokenAmount).to.equal(5n)
      expect(auction.tokenERCStandard).to.equal(1155n)
      expect(auction.endTimestamp).to.equal(expectedEndTime)
      expect(auction.settled).to.equal(false)
      expect(auction.latestBid).to.equal(0n)
      expect(auction.latestBidder).to.equal(zeroAddress)
      expect(auction.beneficiary).to.equal(getAddress(owner.account.address))
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

  describe('Bidding', function () {
    it('allows valid bid', async function () {
      const { auctions, mockERC721, owner, bidder1, getAuction, publicClient } = await loadFixture(baseFixture)

      // Create auction
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const gasPrice = await publicClient.getGasPrice()
      const minBid = gasPrice * 60_000n
      await auctions.write.bid([1n], { value: minBid })

      const auction = await getAuction(1n)
      expect(auction.latestBid).to.equal(minBid)
    })

    it('rejects bid below minimum', async function () {
      const { auctions, mockERC721, owner, publicClient } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await expect(
        auctions.write.bid([1n], { value: 1n })
      ).to.be.rejectedWith('MinimumBidNotMet')
    })

    it('extends auction time during grace period', async function () {
      const { auctions, mockERC721, owner, bidder1, publicClient, getAuction } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      const gasPrice = await publicClient.getGasPrice()
      const minBid = gasPrice * 60_000n
      await auctions.write.bid([1n], { value: minBid })

      // Fast forward to grace period
      const auction = await getAuction(1n)
      await time.increaseTo(auction.endTimestamp - 4 * 60) // 4 minutes before end

      // Place new bid
      const newBid = await auctions.read.currentBidPrice([1n])
      expect(newBid).to.equal(minBid * 110n / 100n)
      await auctions.write.bid([1n], { value: newBid })

      // Check auction was extended
      const updatedAuction = await getAuction(1n)
      expect(updatedAuction.endTimestamp).to.be.greaterThan(auction.endTimestamp)
    })

    it('refunds previous bidder', async function () {
      const { auctions, mockERC721, owner, bidder1, bidder2, publicClient} = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      // First bid
      const gasPrice = await publicClient.getGasPrice()
      const minBid = gasPrice * 60_000n
      await auctions.write.bid([1n], { account: bidder1.account, value: minBid })

      const bidder1InitialBalance = await publicClient.getBalance(bidder1.account)

      // Second bid
      const newBid = await auctions.read.currentBidPrice([1n])
      await auctions.write.bid([1n], { account: bidder2.account, value: newBid })

      const bidder1FinalBalance = await publicClient.getBalance(bidder1.account)
      expect(bidder1FinalBalance).to.equal(bidder1InitialBalance + minBid)
    })

    it('prevents reverting DOS attacks on bids', async function () {
      const { auctions, mockERC721, mockBidDOS, owner, bidder1, publicClient } = await loadFixture(baseFixture)

      // Create auction and place bid
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await mockBidDOS.write.bid([auctions.address, 1n], { value: parseEther('1') })

      let balance = await auctions.read.balances([mockBidDOS.address])
      expect(balance).to.equal(0n)

      await expect(auctions.write.bid([1n], { account: bidder1.account, value: parseEther('2') }))
        .not.to.be.reverted

      balance = await auctions.read.balances([mockBidDOS.address])
      expect(balance).to.equal(parseEther('1'))
    })

    it('prevents gasdrain DOS attacks on bids', async function () {
      const { auctions, mockERC721, mockBidDOS, owner, bidder1, publicClient } = await loadFixture(baseFixture)

      // Create auction and place bid
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await mockBidDOS.write.bid([auctions.address, 1n], { value: parseEther('1') })
      await mockBidDOS.write.setGasdrain([true])

      let balance = await auctions.read.balances([mockBidDOS.address])
      expect(balance).to.equal(0n)

      const request = auctions.write.bid([1n], { account: bidder1.account, value: parseEther('2') })
      const hash = await request
      const tx = await publicClient.waitForTransactionReceipt({ hash })
      expect(tx.gasUsed).to.be.lessThan(150_000)

      await expect(request).not.to.be.reverted

      balance = await auctions.read.balances([mockBidDOS.address])
      expect(balance).to.equal(parseEther('1'))
    })
  })

  describe('Settlement', function () {
    it('settles ERC721 auction with winner', async function () {
      const { auctions, mockERC721, owner, bidder1 } = await loadFixture(baseFixture)

      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await auctions.write.bid([1n], { account: bidder1.account, value: parseEther('1') })

      // Fast forward past end time
      await time.increase(24 * 60 * 60 + 1)

      // Settle auction
      await expect(auctions.write.settle([1n]))
        .to.changeEtherBalance(owner, parseEther('1'))

      // Check NFT transferred to winner
      expect(await mockERC721.read.ownerOf([1n])).to.equal(getAddress(bidder1.account.address))
    })

    it('settles ERC1155 auction with winner', async function () {
      const { auctions, mockERC1155, owner, bidder1 } = await loadFixture(baseFixture)

      await mockERC1155.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        9n,
        '0x'
      ])

      await auctions.write.bid([1n], { account: bidder1.account, value: parseEther('1') })

      // Fast forward past end time
      await time.increase(24 * 60 * 60 + 1)

      // Settle auction
      await expect(auctions.write.settle([1n]))
        .to.changeEtherBalance(owner, parseEther('1'))

      // Check NFT transferred to winner
      expect(await mockERC1155.read.balanceOf([bidder1.account.address, 1n])).to.equal(9n)
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

  describe('Balance Management', function () {
    it('allows withdrawal of failed refunds', async function () {
      const { auctions, mockERC721, mockBidDOS, owner, bidder1, publicClient } = await loadFixture(baseFixture)

      // Create auction and place bid
      await mockERC721.write.safeTransferFrom([
        owner.account.address,
        auctions.address,
        1n,
        '0x'
      ])

      await mockBidDOS.write.bid([auctions.address, 1n], { value: parseEther('1') })

      let balance = await auctions.read.balances([mockBidDOS.address])
      expect(balance).to.equal(0n)

      await auctions.write.bid([1n], { account: bidder1.account, value: parseEther('2') })

      balance = await auctions.read.balances([mockBidDOS.address])
      expect(balance).to.equal(parseEther('1'))

      await expect(mockBidDOS.write.withdraw([auctions.address]))
        .to.changeEtherBalance(mockBidDOS, parseEther('1'))

      expect(await publicClient.getBalance(auctions)).to.equal(parseEther('2'))
    })

    it('prevents withdrawal with zero balance', async function () {
      const { auctions, bidder1 } = await loadFixture(baseFixture)

      await expect(
        auctions.write.withdraw({ account: bidder1.account })
      ).to.be.rejectedWith('NoBalanceToWithdraw')
    })
  })
})
