import { getPublicClient, readContract } from '@wagmi/core'
import { parseAbiItem, type PublicClient } from 'viem'

export const CURRENT_STATE_VERSION = 7
export const MAX_BLOCK_RANGE = 5000n
export const MINT_BLOCKS = BLOCKS_PER_DAY

export const useOnchainStore = () => {
  const { $wagmi } = useNuxtApp()
  const chainId = useMainChainId()
  const client = getPublicClient($wagmi, { chainId }) as PublicClient
  const config = useRuntimeConfig()
  const auctionsAddress: `0x${string}` = config.public.auctionsAddress

  return defineStore('onchainStore', {
    state: () => ({
      version: CURRENT_STATE_VERSION,
      users: {} as { [key: `0x${string}`]: User },
      latestAuction: 0n as bigint,
      auctions: {} as { [key: bigint]: Auctions },
    }),

    getters: {
      all(state) {
        return Object.values(state.auctions)
      },
      user(state) {
        return (address: `0x${string}`) => state.artists[address]
      },
      ens() {
        return (address: `0x${string}`) => this.user(address)?.ens
      },
      displayName() {
        return (address: `0x${string}`) => this.ens(address) || shortAddress(address)
      },
      hasAuction: (state) => (id: bigint) => state.auctions[id] !== undefined,
      auction: (state) => (id: bigint) => state.auctinos[id],
    },

    actions: {
      ensureStoreVersion() {
        if (this.version < CURRENT_STATE_VERSION) {
          console.info(`Reset store`)
          this.$reset()
        }
      },

      async fetchLatestAuction(): Promise<void> {
        this.latestAuction = await readContract($wagmi, {
          abi: AUCTIONS_ABI,
          address: auctionsAddress,
          functionName: 'auctionId',
          chainId,
        })
      },

      async getAuction(id: bigint): Promise<Auction> {
        this.ensureStoreVersion()

        const auction = this.auctions[id]
        if (!auction) return this.fetchAuction(id)

        console.info(`Updating auction #${id}`)

        // Update chain data
        const [
          _tokenContract,
          _tokenId,
          _tokenAmount,
          _tokenERCStandard,
          endTimestamp,
          settled,
          latestBid,
          latestBidder,
          _beneficiary,
        ] = await readContract($wagmi, {
          abi: AUCTIONS_ABI,
          address: auctionsAddress,
          functionName: 'auctions',
          args: [id],
          chainId,
        })

        const currentBlock = await client.getBlockNumber()
        const deltaToEnd = BigInt(
          Math.round((auction.endTimestamp - nowInSeconds()) / Number(BLOCK_TIME))
        )
        auction.untilBlockEstimate = currentBlock + deltaToEnd

        auction.endTimestamp = endTimestamp
        auction.settled = settled
        auction.latestBid = latestBid
        auction.latestBidder = latestBidder

        if (settled && !auction.settleEvent) {
          const [settledLog] = await client.getLogs({
            address: auctionsAddress,
            event: parseAbiItem(
              'event AuctionSettled(uint256 indexed auctionId, address indexed winner, address indexed beneficiary, uint256 amount)'
            ),
            args: {
              auctionId: BigInt(auction.id),
            },
            fromBlock: auction.createdBlockEstimate,
            toBlock: 'latest',
          })

          const tx = await client.getTransaction({
            hash: settledLog.transactionHash,
          })

          auction.settleEvent = {
            block: settledLog.blockNumber,
            logIndex: settledLog.logIndex,
            tx: settledLog.transactionHash,
            from: tx.from,
          }
        } else {
          this.fetchMinimumBid(id)
        }

        return auction
      },

      async fetchAuction(id: bigint): Promise<Auction> {
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
        ] = await readContract($wagmi, {
          abi: AUCTIONS_ABI,
          address: auctionsAddress,
          functionName: 'auctions',
          args: [id],
          chainId,
        })

        const [initLog] = await client.getLogs({
          address: auctionsAddress,
          event: parseAbiItem(
            'event AuctionInitialised(uint256 indexed auctionId, address indexed tokenContract, uint256 indexed tokenId, uint16 tokenERCStandard, uint40 endTimestamp, address beneficiary)'
          ),
          args: {
            auctionId: BigInt(id),
          },
          fromBlock: 0n,
        })

        const BLOCK_BUFFER = 600n // 2 hours
        const createdBlockEstimate = initLog.blockNumber
        console.log('createdBlockEstimate', createdBlockEstimate)
        const untilBlockEstimate = createdBlockEstimate + BLOCKS_PER_DAY + BLOCK_BUFFER

        const collection: Collection = {
          address: tokenContract,
          tokenStandard: tokenERCStandard,
        }

        const metadata =
          tokenERCStandard === 721
            ? await getERC721Metadata(client, tokenContract, tokenId)
            : await getERC1155Metadata(client, tokenContract, tokenId)

        const token: Token = {
          tokenId,
          name: metadata.name || '',
          description: metadata.description || '',
          image:
            (await resolveURI(metadata.image, {
              ipfs: config.public.ipfsGateway,
              ar: config.public.arweaveGateway,
            })) || '',
          animationUrl: await resolveURI(metadata.animation_url, {
            ipfs: config.public.ipfsGateway,
            ar: config.public.arweaveGateway,
          }),
        }

        const auction: Auction = {
          id,
          collection,
          token,
          amount: tokenAmount,
          settled,
          endTimestamp,
          latestBid,
          latestBidder,
          beneficiary,
          bidsFetchedUntilBlock: 0n,
          bidsBackfilledUntilBlock: 0n,
          createdBlockEstimate,
          untilBlockEstimate,
          bids: [],
          initEvent: {
            block: initLog.blockNumber,
            logIndex: initLog.logIndex,
            tx: initLog.transactionHash,
          },
        }

        this.auctions[id] = auction

        return auction
      },

      async fetchMinimumBid(id: bigint) {
        const auction = this.auctions[id]
        if (!auction) await fetchAuction(id)

        auction.currentBidPrice = await readContract($wagmi, {
          abi: AUCTIONS_ABI,
          address: auctionsAddress,
          functionName: 'currentBidPrice',
          args: [id],
          chainId,
        })

        return auction
      },

      async fetchAuctionBids(id: bigint) {
        const auction = this.auctions[id.toString()]
        const client = getPublicClient($wagmi, { chainId }) as PublicClient
        const currentBlock = await client.getBlockNumber()

        const createdBlockEstimate = auction.createdBlockEstimate
        const untilBlockEstimate = auction.untilBlockEstimate

        // We want to sync until now, or when the mint closed
        const toBlock = currentBlock > untilBlockEstimate ? untilBlockEstimate : currentBlock

        if (auction.bidsFetchedUntilBlock >= toBlock) {
          return console.info(`bids for #${auction.id} already fetched`)
        }

        // Initially, we want to sync backwards,
        // but at most 5000 blocks (the general max range for an event query)
        const maxRangeBlock = toBlock - MAX_BLOCK_RANGE
        const fromBlock =
          auction.bidsFetchedUntilBlock > maxRangeBlock // If we've already fetched
            ? auction.bidsFetchedUntilBlock + 1n // we want to continue where we left off
            : maxRangeBlock > createdBlockEstimate // Otherwise we'll go back as far as possible
              ? maxRangeBlock // (to our max range)
              : createdBlockEstimate // (or all the way to when the auction was created)

        // Load bids in range
        const newBids = await this.loadBidEvents(auction, fromBlock, toBlock)
        this.addAuctionBids(auction, newBids)

        // Set sync status
        auction.bidsFetchedUntilBlock = toBlock

        // If this is our first fetch, mark until when we have backfilled
        if (!auction.bidsBackfilledUntilBlock) {
          auction.bidsBackfilledUntilBlock = fromBlock
        }

        // Update minimum bid
        if (newBids.length) {
          await Promise.all([this.getAuction(id), this.fetchMinimumBid(id)])
        }

        // Check bid consistency after fully syncing to current block
        if (auction.bidsFetchedUntilBlock >= currentBlock && auction.bids.length) {
          const lastFetchedBid = auction.bids[0]?.value || 0n // Most recent bid is first after reverse()
          console.debug(
            `Checking bid mismatch - latest bid is ${auction.latestBid} & last synced tx is ${lastFetchedBid}`
          )

          // If there's a mismatch between latestBid and the last fetched bid
          if (auction.latestBid !== lastFetchedBid) {
            console.warn(
              `Bid mismatch detected for auction #${id}. Clearing and re-syncing...`
            )
            console.warn(`Expected: ${auction.latestBid}, Got: ${lastFetchedBid}`)

            // Clear existing bid data
            auction.bids = []
            auction.bidsFetchedUntilBlock = 0n
            auction.bidsBackfilledUntilBlock = 0n

            // Re-fetch all bids
            await this.fetchAuctionBids(id)

            // Backfill remaining bids if needed
            while (auction.bidsBackfilledUntilBlock > createdBlockEstimate) {
              await this.backfillAuctionBids(id)
            }
          }
        }
      },

      async backfillAuctionBids(id: bigint) {
        const auction = this.auctions[id]

        // If we've backfilled all the way;
        if (auction.bidsBackfilledUntilBlock <= auction.createdBlockEstimate) return

        // We want to fetch the tokens up until where we stopped backfilling (excluding the last block)
        const toBlock = auction.bidsBackfilledUntilBlock - 1n

        // We want to fetch until our max range (5000), or until when the auction was created
        const fromBlock =
          toBlock - MAX_BLOCK_RANGE > auction.createdBlockEstimate
            ? toBlock - MAX_BLOCK_RANGE
            : auction.createdBlockEstimate
        console.info(`Backfilling auction bid blocks ${fromBlock}-${toBlock}`)

        // Finally, we update our database
        this.addAuctionBids(
          auction,
          await this.loadBidEvents(auction, fromBlock, toBlock),
          'append'
        )

        // And save until when we have backfilled our tokens.
        auction.bidsBackfilledUntilBlock = fromBlock
      },

      async loadBidEvents(
        auction: Auction,
        fromBlock: bigint,
        toBlock: bigint
      ): Promise<BidEvent[]> {
        const logs = await client.getLogs({
          address: auctionsAddress,
          event: parseAbiItem(
            'event Bid(uint256 indexed auctionId, uint256 indexed bid, address indexed from)'
          ),
          args: {
            auctionId: BigInt(auction.id),
          },
          fromBlock: fromBlock,
          toBlock: toBlock,
        })

        console.info(`Bids fetched from ${fromBlock}-${toBlock}`)

        return logs
          .map(
            (l) =>
              ({
                auctionId: auction.id,
                address: l.args.from,
                block: l.blockNumber,
                logIndex: l.logIndex,
                tx: l.transactionHash,
                value: l.args.bid,
              }) as BidEvent
          )
          .reverse()
      },

      async addAuctionBids(
        auction: Auction,
        bids: BidEvent[],
        location: 'prepend' | 'append' = 'prepend'
      ) {
        console.log('adding bids', bids)
        auction.bids =
          location === 'prepend' ? [...bids, ...auction.bids] : [...auction.bids, ...bids]
      },

      initializeUser(address: `0x${string}`) {
        const user: User = {
          address,
          ens: '',
          avatar: '',
          description: '',
          profileUpdatedAtBlock: 0n,
        }

        this.users[user.address] = user

        return user
      },

      async fetchUserProfile(address: `0x${string}`): Promise<Artist> {
        const client = getPublicClient($wagmi, { chainId: 1 }) as PublicClient
        const block = await client.getBlockNumber()

        // Only update once per hour
        if (
          this.user(address)?.profileUpdatedAtBlock > 0n &&
          block - this.user(address).profileUpdatedAtBlock < BLOCKS_PER_CACHE
        ) {
          console.info(`User profile already fetched...`)
          return this.user(address)
        }

        console.info(`Updating user profile...`)

        let ens, avatar, description, url, email, twitter, github

        try {
          ens = await client.getEnsName({ address })

          if (ens) {
            ;[avatar, description, url, email, twitter, github] = await Promise.all([
              client.getEnsAvatar({ name: ens }),
              client.getEnsText({ name: ens, key: 'description' }),
              client.getEnsText({ name: ens, key: 'url' }),
              client.getEnsText({ name: ens, key: 'email' }),
              client.getEnsText({ name: ens, key: 'com.twitter' }),
              client.getEnsText({ name: ens, key: 'com.github' }),
            ])
          }
        } catch (e) {}

        this.users[address].ens = ens
        this.users[address].avatar = avatar
        this.users[address].description = description
        this.users[address].url = url
        this.users[address].email = email
        this.users[address].twitter = twitter
        this.users[address].github = github
        this.users[address].profileUpdatedAtBlock = block

        return this.user(address)
      },
    },

    persist: {
      storage: persistedState.localStorage,
      serializer: {
        serialize: stringifyJSON,
        deserialize: parseJSON,
      },
    },
  })()
}
