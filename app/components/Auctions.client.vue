<template>
  <slot
    v-bind="{
      displayPrice,
      dollarPrice: priceFeed.weiToUSD(price),
      currentBlock,
      latestAuctionId: store.latestAuction,
      mainAuctionId,
    }"
  />
</template>

<script setup>
import { useBlockNumber } from '@wagmi/vue'

const config = useRuntimeConfig()
const store = useOnchainStore()
const priceFeed = usePriceFeedStore()
const chainId = useMainChainId()

const { price, displayPrice } = useMinimumBidValue()
const { data: currentBlock } = useBlockNumber({ chainId })

const mainAuctionId = computed(() => {
  if (config.public.auctionId) {
    return config.public.auctionId
  }

  return store.latestAuction
})

await store.fetchLatestAuction()
</script>
