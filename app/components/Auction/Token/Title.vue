<template>
  <h1>
    {{ token.name }} <small>#{{ token.tokenId }}</small>
  </h1>
</template>

<script setup lang="ts">
const { token } = defineProps<{
  token: Token
}>()
</script>
