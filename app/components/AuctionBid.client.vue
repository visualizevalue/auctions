<template>
  <slot
    v-bind="{
      displayPrice,
      dollarPrice: priceFeed.weiToUSD(BigInt(value)),
      bidRequest,
      bidComplete,
      auctionOpen,
      currentBlock,
      blocksRemaining,
      secondsRemaining,
      countDownStr,
      until,
      transactionFlowConfig: {
        title: {
          chain: 'Switch Chain',
          requesting: 'Confirm In Wallet',
          waiting: 'Transaction Submitted',
          complete: 'Success!',
        },
        lead: {
          chain: 'Requesting to switch chain...',
          requesting: 'Requesting Signature...',
          waiting: 'Checking Bid Transaction...',
          complete: `Your bid on this auction was placed...`,
        },
        action: {
          confirm: 'Bid',
          error: 'Bid',
          complete: 'OK',
        },
      },
    }"
  />
</template>

<script setup>
import { formatEther } from 'viem'
import { useAccount, useBlockNumber } from '@wagmi/vue'

const config = useRuntimeConfig()

const { $wagmi } = useNuxtApp()
const { address } = useAccount()

const props = defineProps({
  auction: Object,
  value: BigInt,
})
const emit = defineEmits(['bidComplete'])
const store = useOnchainStore()
const priceFeed = usePriceFeedStore()

const displayPrice = computed(() => formatEther(props.value))

const { data: currentBlock } = useBlockNumber({
  chainId: config.public.chainId,
})
const blocksRemaining = computed(
  () => props.auction.untilBlockEstimate - Number(currentBlock.value || 0n)
)
const now = useNow()
const until = computed(() => props.auction.endTimestamp)
const secondsRemaining = computed(() => until.value - now.value)
const auctionOpen = computed(() => secondsRemaining.value > 0)
const { str: countDownStr } = useCountDown(secondsRemaining)

const bidRequest = computed(() => async () => {
  return writeContract($wagmi, {
    abi: AUCTIONS_ABI,
    chainId: config.public.chainId,
    address: config.public.auctionsAddress,
    functionName: 'bid',
    args: [props.auction.id],
    value: props.value,
    gas: 80_000n,
  })
})

const bidComplete = async () => {
  await store.fetchMinimumBid(props.auction.id)

  emit('bidComplete')
}
</script>
