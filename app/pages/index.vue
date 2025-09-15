<template>
  <PageFrame>
    <p>{{ config.public.description }}</p>

    <Auctions
      v-slot="{ displayPrice, dollarPrice, currentBlock, latestAuctionId, mainAuctionId }"
    >
      <Connect
        @connected="
          ($event) =>
            navigateTo({ name: 'id', params: { id: mainAuctionId } }, { replace: true })
        "
      >
        <template #connected>
          <!-- <pre> -->
          <!--   {{ displayPrice.value }} {{ displayPrice.format }} -->
          <!--   $ {{ dollarPrice }} -->
          <!--   Block: {{ currentBlock }} -->
          <!---->
          <!--   --- -->
          <!---->
          <!--   main auction: {{ mainAuctionId }} -->
          <!--   latest auction: {{ latestAuctionId }} -->
          <!-- </pre> -->
        </template>
      </Connect>
    </Auctions>
  </PageFrame>
</template>

<script setup>
const config = useRuntimeConfig()

useMetaData({
  title: config.public.title,
  description: config.public.description,
})
</script>

<style scoped>
header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--spacer);

  p {
    text-align: center;
    color: var(--muted);
  }
}

/* HEIGHT */
header {
  height: 100dvh;
}
</style>
