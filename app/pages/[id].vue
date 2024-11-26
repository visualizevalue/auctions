<template>
  <Loading v-if="status !== 'success'" />
  <NuxtPage v-else :auction="auction" />
</template>

<script setup>
const store = useOnchainStore()
const route = useRoute()
const auctionId = computed(() => route.params.id)

const { data: auction, status } = useAsyncData(
  'auction',
  () => store.getAuction(auctionId.value),
  {
    watch: [auctionId],
  }
)
</script>
