<template>
  <div ref="wrapper">
    <RecycleScroller
      :items="bids"
      :item-size="itemSize"
      key-field="tx"
      list-class="token-mint-timeline-items"
      page-mode
    >
      <template #default="{ item: bid }">
        <AuctionBidTimelineItem
          :bid="bid"
          :key="bid.tx"
          :block="block"
        />
      </template>
    </RecycleScroller>
  </div>
</template>

<script setup>
import { useElementSize } from '@vueuse/core'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

defineProps({
  bids: Array,
  block: BigInt,
})

const wrapper = ref()
const REM = 16
const { width: wrapperWidth } = useElementSize(wrapper)
const itemSize = computed(() => 24 * REM > wrapperWidth.value ? 60 : 40)
</script>

