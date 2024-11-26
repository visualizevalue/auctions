<template>
  <div class="auction-bid-timeline-item">
    <slot :bid="bid" :formatted-price="formattedPrice">
      <!-- <NuxtLink :to="{ name: 'profile-address', params: { address: bid.address } }" class="account"> -->
      <!--   <Account :address="bid.address" /> -->
      <!-- </NuxtLink> -->
      <Account :address="bid.address" />

      <span class="price">{{ formattedPrice.value }} {{ formattedPrice.format }}</span>

      <span class="time-ago"><BlocksTimeAgo :blocks="block - bid.block" /></span>

      <span class="links">
        <NuxtLink :to="`${config.public.blockExplorer}/tx/${bid.tx}`" target="_blank">
          <Icon type="link" />
        </NuxtLink>
      </span>
    </slot>
  </div>
</template>

<script setup>
const config = useRuntimeConfig()

const props = defineProps({
  bid: Object,
  block: BigInt,
})

const formattedPrice = computed(() => props.bid && customFormatEther(props.bid.value))
</script>

<style>
  .auction-bid-timeline-item {
    display: grid;
    gap: 0 var(--spacer-sm);
    grid-template-columns: 1fr 1fr;
    padding: var(--size-2) 0;

    .account {
      grid-column: span 2;
    }

    .price,
    .links {
      text-align: right;
    }

    span {
      white-space: nowrap;

      &:not(.account):not(.account *) {
        color: var(--muted);
        font-size: var(--font-sm);
      }
    }

    a,
    button {
      color: var(--color);

      &:--highlight {
        color: var(--color);
      }
    }

    @container (min-width: 24rem) {
      grid-template-columns: max(6rem, 40%) 1fr 1fr 2rem;
      gap: var(--spacer);

      .account {
        grid-column: 1;
      }

      .time-ago,
      .amount {
        text-align: right;
      }

      span:not(.account) {
        font-size: var(--font-base);
      }
    }
  }
</style>
