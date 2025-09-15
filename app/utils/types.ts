import type { RouteLocationRaw } from 'vue-router'

// =====================================================================
// DATA
// =====================================================================
export interface User {
  address: `0x${string}`
  ens?: string | null
  avatar?: string | null
  description?: string | null
  url?: string | null
  email?: string | null
  twitter?: string | null
  github?: string | null
  profileUpdatedAtBlock: bigint
}

export interface Auction {
  id: bigint
  collection: Collection
  token: Token
  amount: bigint
  settled: bool
  endTimestamp: bigint
  latestBid: bigint
  latestBidder: `0x${string}`
  beneficiary: `0x${string}`
  bidsFetchedUntilBlock: bigint
  bidsBackfilledUntilBlock: bigint
  bids: BidEvent[]
  createdBlockEstimate: number
  untilBlockEstimate: number
  currentBidPrice: bigint
  initEvent: InitEvent
  settleEvent?: SettleEvent
}

export interface Collection {
  address: `0x${string}`
  tokenStandard: 721 | 1155
  owner?: `0x${string}`
  image?: string
  name?: string
  symbol?: string
  description?: string
}

export interface Token {
  tokenId: bigint
  name: string
  description: string
  image: string
  animationUrl?: string
}

export interface BidEvent {
  auctionId: bigint
  address: `0x${string}`
  block: bigint
  logIndex: number
  tx: string
  value: bigint
}

export interface InitEvent {
  block: bigint
  logIndex: number
  tx: string
  timestamp?: bigint
}

export interface SettleEvent {
  block: bigint
  logIndex: number
  tx: string
  timestamp?: bigint
  from: `0x${string}`
}
