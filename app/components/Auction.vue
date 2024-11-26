<template>
  <Loading v-if="status !== 'success'" />
  <AuctionDetail v-else :auction="auction" />
</template>

<script setup>
const props = defineProps({ id: [String, Number] })

const store = useOnchainStore()
const auctionId = computed(() => props.id)

const { data: auction, status } = useAsyncData(
  'auction',
  () => store.getAuction(auctionId.value),
  {
    watch: [auctionId],
  }
)
</script>
