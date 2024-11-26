<template>
  {{ $t('auction.closes_in', { time }) }}
</template>

<script setup>
defineProps({
  time: String,
  blocks: String,
})
</script>
