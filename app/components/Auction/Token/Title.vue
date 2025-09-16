<template>
  <h1>
    {{ token.name }} <small>#{{ token.tokenId }}</small>
  </h1>
  <p v-if="token.description">
    <ExpandableText
      :text="token.description"
      :length="95"
      :expand-text="$t('read_more')"
      :collapse-text="$t('collapse')"
    />
  </p>
</template>

<script setup lang="ts">
const { token } = defineProps<{
  token: Token
}>()
</script>
