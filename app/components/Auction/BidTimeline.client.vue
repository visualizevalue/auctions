<template>
  <section class="auction-bid-timeline">
    <slot :bids="bids" :loading="loading">
      <h1>{{ $t('auction.bid_timeline') }}</h1>

      <template v-if="currentBlock">
        <AuctionBidTimelineItem v-if="auction.settleEvent">
          <Account :address="auction.settleEvent.from" />

          <span class="price">
            Settled Auction
          </span>

          <span class="time-ago"><BlocksTimeAgo :blocks="currentBlock - auction.settleEvent.block" /></span>

          <span class="links">
            <NuxtLink :to="`${config.public.blockExplorer}/tx/${auction.settleEvent.tx}`" target="_blank">
              <Icon type="link" />
            </NuxtLink>
          </span>
        </AuctionBidTimelineItem>

        <AuctionBidTimelineItem
          v-for="bid in bids"
          :bid="bid"
          :key="bid.tx"
          :block="currentBlock"
        />

        <AuctionBidTimelineItem v-if="auction.initEvent">
          <Account :address="auction.beneficiary" />

          <span class="price">
            Initialized Auction
          </span>

          <span class="time-ago"><BlocksTimeAgo :blocks="currentBlock - auction.initEvent.block" /></span>

          <span class="links">
            <NuxtLink :to="`${config.public.blockExplorer}/tx/${auction.initEvent.tx}`" target="_blank">
              <Icon type="link" />
            </NuxtLink>
          </span>
        </AuctionBidTimelineItem>
      </template>

      <div v-if="! backfillComplete" v-show="! loading" ref="loadMore" class="load-more">
        <Button @click="backfill">{{ $t('load_more')}}</Button>
      </div>

      <Loading v-if="loading || ! currentBlock" :txt="$t('auction.loading_bid_history')" />
    </slot>
  </section>
</template>

<script setup>
import { useElementVisibility } from '@vueuse/core'
import { useBlockNumber } from '@wagmi/vue'

const config = useRuntimeConfig()
const { data: currentBlock } = useBlockNumber({ chainId: config.public.chainId })

const props = defineProps({
  auction: Object,
})

const state = useOnchainStore()

const bids = computed(() => props.auction.bids)
const backfillComplete = computed(() => props.auction.bidsBackfilledUntilBlock <= props.auction.createdBlockEstimate)

const loading = ref(true)
const loadMore = ref()
const loadMoreVisible = useElementVisibility(loadMore)
const backfill = async () => {
  loading.value = true

  try {
    await state.backfillAuctionBids(props.auction.id)

    // If we're not fully backfilled and we have less than 20 bids loaded,
    // continue backfilling events.
    while (! backfillComplete.value && bids.value?.length < 20) {
      await delay(250)
      await state.backfillAuctionBids(props.auction.id)
    }
  } catch (e) {
    console.error(`Issue during backfill`, e)
  }

  loading.value = false
}

onMounted(async () => {
  loading.value = true
  try {
    console.info(`Attempting to load + backfill auction bids for #${props.auction.id}`)
    await state.fetchAuctionBids(props.auction.id)
    await backfill()
  } catch (e) {
    console.error(e)
  }
  loading.value = false
})

watch(loadMoreVisible, () => {
  // Skip if we have enough bids for the viewport or we're already loading
  if (! loadMoreVisible.value || loading.value) return

  backfill()
})

watch(currentBlock, () => {
  if (loading.value) return

  state.fetchAuctionBids(props.auction.id)
})
</script>

<style scoped>
.auction-bid-timeline {
  padding-top: var(--spacer-lg);
  padding-bottom: var(--spacer-lg);
  container-type: inline-size;

  :deep(.auction-bid-timeline-items) {
    display: grid;
    gap: var(--spacer);
  }
}

h1 {
  margin-bottom: var(--spacer);
  font-size: var(--font-base);
  border-bottom: var(--border);
  padding: 0 0 var(--spacer);
  margin: 0 0 var(--spacer);
}

.load-more {
  .button {
    display: block;
    width: 100%;
  }
}
</style>
