<template>
  <main>
    <Auction v-if="scope" :id="scope" />
    <NuxtPage v-else />
  </main>
</template>

<script setup>
const config = useRuntimeConfig()

const scope = computed(() => config.public.auctionId)
</script>

<style scoped>
main {
  display: grid;
  gap: var(--spacer);
}
</style>

