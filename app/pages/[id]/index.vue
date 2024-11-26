<template>
  <PageFrame class="full">
    <!-- <pre> -->
    <!--   <h1>Auction</h1> -->
    <!--   <pre>{{ JSON.stringify(JSON.parse(stringifyJSON(auction)), null, 4)}}</pre> -->
    <!-- </pre> -->
    <AuctionDetail :auction="auction" />
  </PageFrame>
</template>

<script setup>
const store = useOnchainStore()

const props = defineProps({
  auction: Object,
})

useMetaData({
  title: `Auction`,
})
</script>

