import { getBalance, getPublicClient, readContract } from '@wagmi/core'
import { type GetBalanceReturnType } from '@wagmi/core'
import { parseAbiItem, type PublicClient } from 'viem'

export const CURRENT_STATE_VERSION = 1
export const MAX_BLOCK_RANGE = 1800n
export const MINT_BLOCKS = BLOCKS_PER_DAY

export const useOnchainStore = () => {
  const { $wagmi } = useNuxtApp()
  const chainId = useMainChainId()
  const client = getPublicClient($wagmi, { chainId }) as PublicClient
  const config = useRuntimeConfig()
  const auctionsAddress = config.public.auctionsAddress

  return defineStore('onchainStore', {

    state: () => ({
      version: CURRENT_STATE_VERSION,
      users: {} as { [key: `0x${string}`]: User },
      latestAuction: 0n as bigint,
      auctions: {} as { [key: bigint]: Auctions },
    }),

    getters: {
      all (state) {
        return Object.values(state.auctions)
      },
      user (state) {
        return (address: `0x${string}`) => state.artists[address]
      },
      ens () {
        return (address: `0x${string}`) => this.user(address)?.ens
      },
      displayName () {
        return (address: `0x${string}`) => this.ens(address) || shortAddress(address)
      },
      hasAuction: (state) => (id: bigint) => state.auctions[id] !== undefined,
      auction: (state) => (id: bigint) => state.auctinos[id],
    },

    actions: {
      ensureStoreVersion () {
        if (this.version < CURRENT_STATE_VERSION) {
          console.info(`Reset store`)
          this.$reset()
        }
      },

      async fetchLatestAuction (): Promise<void> {
        this.latestAuction = await readContract($wagmi, {
          abi: AUCTIONS_ABI,
          address: auctionsAddress,
          functionName: 'auctionId',
          chainId,
        })
      },

      async getAuction (id: bigint): Promise<Auction> {
        const auction = this.auctions[id]
        if (! auction) return this.fetchAuction(id)

        // Update chain data
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

        const currentBlock = Number(await client.getBlockNumber())
        const deltaToEnd = parseInt((auction.endTimestamp - nowInSeconds()) / Number(BLOCK_TIME))
        auction.untilBlockEstimate = currentBlock + deltaToEnd
        auction.createdBlockEstimate = auction.untilBlockEstimate - Number(BLOCKS_PER_DAY - 600n)

        auction.endTimestamp = endTimestamp
        auction.settled = settled
        auction.latestBid = latestBid
        auction.latestBidder = latestBidder

        return auction
      },

      async fetchAuction (id: bigint): Promise<Auction> {
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

        const collection: Collection = {
          address: tokenContract,
          tokenStandard: tokenERCStandard,
        }

        const metadata = tokenERCStandard === 721
          ? await getERC721Metadata(client, tokenContract, tokenId)
          : await getERC1155Metadata(client, tokenContract, tokenId)

        const token: Token = {
          tokenId,
          name: metadata.name || '',
          description: metadata.description || '',
          image: await resolveURI(metadata.image, { ipfs: config.public.ipfsGateway, ar: config.public.arweaveGateway }) || '',
          animationUrl: await resolveURI(metadata.animation_url, { ipfs: config.public.ipfsGateway, ar: config.public.arweaveGateway }),
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
          createdBlockEstimate: 0,
          untilBlockEstimate: 0,
          bids: [],
        }

        const currentBlock = Number(await client.getBlockNumber())
        const deltaToEnd = parseInt((auction.endTimestamp - nowInSeconds()) / Number(BLOCK_TIME))
        auction.untilBlockEstimate = currentBlock + deltaToEnd
        auction.createdBlockEstimate = auction.untilBlockEstimate - Number(BLOCKS_PER_DAY - 600n)

        this.auctions[id] = auction

        return auction
      },

      async fetchMinimumBid (id: bigint) {
        const auction = this.auctions[id]
        if (! auction) await fetchAuction(id)

        auction.currentBidPrice = await readContract($wagmi, {
          abi: AUCTIONS_ABI,
          address: auctionsAddress,
          functionName: 'currentBidPrice',
          args: [id],
          chainId,
        })

        return auction
      },

      async fetchAuctionBids (id: bigint) {
        const auction = this.auctions[id]
        const client = getPublicClient($wagmi, { chainId }) as PublicClient
        const currentBlock = Number(await client.getBlockNumber())

        const createdBlockEstimate = auction.createdBlockEstimate
        const untilBlockEstimate = auction.untilBlockEstimate

        // We want to sync until now, or when the mint closed
        const toBlock = currentBlock > untilBlockEstimate ? untilBlockEstimate : currentBlock

        if (auction.bidsFetchedUntilBlock >= toBlock) {
          return console.info(`bids for #${auction.id} already fetched`)
        }

        // Initially, we want to sync backwards,
        // but at most 5000 blocks (the general max range for an event query)
        const maxRangeBlock = toBlock - Number(MAX_BLOCK_RANGE)
        const fromBlock = auction.bidsFetchedUntilBlock > maxRangeBlock // If we've already fetched
          ? auction.bidsFetchedUntilBlock + 1 // we want to continue where we left off
          : maxRangeBlock > createdBlockEstimate // Otherwise we'll go back as far as possible
            ? maxRangeBlock // (to our max range)
            : createdBlockEstimate // (or all the way to when the auction was created)

        // Load bids in range
        const newBids = await this.loadBidEvents(auction, fromBlock, toBlock)
        this.addAuctionBids(auction, newBids)

        // Set sync status
        auction.bidsFetchedUntilBlock = toBlock

        // If this is our first fetch, mark until when we have backfilled
        if (! auction.bidsBackfilledUntilBlock) {
          auction.bidsBackfilledUntilBlock = fromBlock
        }

        // Update minimum bid
        if (! newBids.length) await this.fetchMinimumBid(id)
      },

      async backfillAuctionBids (id: bigint) {
        const auction = this.auctions[id]

        // If we've backfilled all the way;
        if (auction.bidsBackfilledUntilBlock <= auction.createdBlockEstimate) return

        // We want to fetch the tokens up until where we stopped backfilling (excluding the last block)
        const toBlock = auction.bidsBackfilledUntilBlock - 1

        // We want to fetch until our max range (5000), or until when the auction was created
        const fromBlock = toBlock - Number(MAX_BLOCK_RANGE) > auction.createdBlockEstimate
          ? toBlock - Number(MAX_BLOCK_RANGE)
          : auction.createdBlockEstimate
        console.info(`Backfilling auction bid blocks ${fromBlock}-${toBlock}`)

        // Finally, we update our database
        this.addAuctionBids(auction, await this.loadBidEvents(auction, fromBlock, toBlock), 'append')

        // And save until when we have backfilled our tokens.
        auction.bidsBackfilledUntilBlock = fromBlock
      },

      async loadBidEvents (auction: Auction, fromBlock: number, toBlock: number): Promise<BidEvent[]> {
        const logs = await client.getLogs({
          address: auctionsAddress,
          event: parseAbiItem('event Bid(uint256 indexed auctionId, uint256 indexed bid, address indexed from)'),
          args: {
            auctionId: BigInt(auction.id),
          },
          fromBlock: BigInt(fromBlock),
          toBlock: BigInt(toBlock),
        })

        console.info(`Bids fetched from ${fromBlock}-${toBlock}`)

        return logs.map(l => ({
          auctionId: auction.id,
          address: l.args.from,
          block: l.blockNumber,
          logIndex: l.logIndex,
          tx: l.transactionHash,
          value: l.args.bid
        }) as BidEvent).reverse()
      },

      async addAuctionBids (auction: Auction, bids: BidEvent[], location: 'prepend'|'append' = 'prepend') {
        console.log('adding bids', bids)
        auction.bids = location === 'prepend'
          ? [ ...bids, ...auction.bids ]
          : [ ...auction.bids, ...bids ]
      },

      initializeUser (address: `0x${string}`) {
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

      async fetchUserProfile (address: `0x${string}`): Promise<Artist> {
        const client = getPublicClient($wagmi, { chainId: 1 }) as PublicClient
        const block = await client.getBlockNumber()

        // Only update once per hour
        if (
          this.user(address)?.profileUpdatedAtBlock > 0n &&
          (block - this.user(address).profileUpdatedAtBlock) < BLOCKS_PER_CACHE
        ) {
          console.info(`User profile already fetched...`)
          return this.user(address)
        }

        console.info(`Updating user profile...`)

        let ens, avatar, description,
          url, email, twitter, github

        try {
          ens = await client.getEnsName({ address })

          if (ens) {
            [avatar, description, url, email, twitter, github] = await Promise.all([
              client.getEnsAvatar({ name: ens }),
              client.getEnsText({ name: ens, key: 'description' }),
              client.getEnsText({ name: ens, key: 'url' }),
              client.getEnsText({ name: ens, key: 'email' }),
              client.getEnsText({ name: ens, key: 'com.twitter' }),
              client.getEnsText({ name: ens, key: 'com.github' }),
            ])
          }
        } catch (e) { }

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
