<template>
  <article class="auction-detail">
    <div class="artifact">
      <div>
        <Embed v-if="token.animationUrl" :src="token.animationUrl" />
        <Image v-else-if="token.image" :src="token.image" :alt="token.name" />
        <ImageVoid v-else />
      </div>

      <!-- <Actions> -->
      <!--   <Button :to="{ name: 'id-collection-tokenId-full' }" title="Open"> -->
      <!--     <Icon type="maximize" /> -->
      <!--   </Button> -->
      <!-- </Actions> -->
    </div>

    <AuctionBid
      :auction="auction"
      :value="parseEther(value)"
      #default="{
        displayPrice,
        dollarPrice,
        bidRequest,
        bidComplete,
        auctionOpen,
        currentBlock,
        countDownStr,
        blocksRemaining,
        transactionFlowConfig
      }"
    >
      <section class="details">
        <header class="title">
          <h1>{{ token.name }} <small>#{{ token.tokenId }}</small></h1>
          <p v-if="token.description">
            <ExpandableText :text="token.description" :length="95" :expand-text="$t('read_more')" :collapse-text="$t('collapse')" />
          </p>
          <!-- <p>Token Standard: ERC-{{ collection.tokenStandard }}</p> -->
          <!-- <p v-if="collection" class="artist"> -->
          <!--   {{ $t('token.by') }} <NuxtLink :to="{ name: 'id', params: { id: collection.owner } }">{{ store.displayName(collection.owner) }}</NuxtLink> -->
          <!-- </p> -->
          <slot name="header-after" />
        </header>

        <slot name="secondary-details" />

        <div v-if="auctionOpen">
          <BidOnAuctionBar
            v-model:value="value"
            v-bind="{
              auction,
              token,
              displayPrice,
              dollarPrice,
              bidRequest,
              transactionFlowConfig,
              bidComplete,
            }"
          />
        </div>

        <div class="auction-status">
          <p v-if="auctionOpen">
            <AuctionBidOpen :time="countDownStr" />
          </p>
          <p v-else-if="currentBlock">
            {{ $t('auction.closed_on', { date: formatDateTime(isoDateFromSeconds (auction.endTimestamp)) })}}
          </p>
        </div>

        <AuctionBidTimeline :auction="auction" />
      </section>
    </AuctionBid>
  </article>
</template>

<script setup lang="ts">
const { auction } = defineProps<{
  auction: Auction
}>()

const store = useOnchainStore()
const token = computed(() => auction.token)
const collection = computed(() => auction.collection)

const value = ref('0.1')
</script>

<style scoped>
  .auction-detail {
    position: relative;
    container-type: inline-size;

    display: grid;
    grid-auto-rows: min-content;
    padding: 0 !important;
    /* border-top: var(--border); */

    @media (--md) {
      height: calc(100dvh - var(--navbar-height));
      grid-template-columns: 50% 1fr;
      grid-auto-rows: auto;
    }

    @media (--lg) {
      grid-template-columns: 60% 1fr;
    }
  }

  .artifact {
    --padding-x: 0;
    --padding-top: 0;
    --padding-bottom: 0;
    --width: 100cqw;
    --height: 100%;
    --dimension: min(100cqw, 100cqh);

    @media (--md) {
      --width: 50cqw;
      --height: calc(100cqh - var(--navbar-height));
      --height: 100cqh;
      --padding-top: var(--spacer-lg);
      --padding-x: var(--spacer-lg);
      --padding-bottom: calc(var(--spacer-lg) + var(--spacer));
      --padding-bottom: var(--spacer-lg);

      --dimension: min(
        calc(var(--width) - var(--padding-x)*2),
        calc(100cqh - var(--padding-top) - var(--padding-bottom))
      );
    }

    @media (--lg) {
      --width: 60cqw;
      --padding-top: var(--spacer-xl);
      --padding-x: var(--spacer-xl);
      --padding-bottom: calc(var(--spacer-xl) + var(--spacer));
    }

    height: var(--height);
    width: var(--width);
    padding: var(--padding-top) var(--padding-x) var(--padding-bottom);
    position: relative;

    @media (--md) {
      border-right: var(--border);
      display: flex;
      justify-content: center;
      align-items: center;
    }

    > *:not(menu) {
      width: var(--dimension);
      height: auto;
      border-bottom: var(--border) !important;
      transition: transform var(--speed-slow), box-shadow var(--speed-slow);

      @media (--md) {
        border-bottom: none !important;
      }
    }

    > menu {
      position: absolute;
      bottom: var(--spacer);
      right: var(--spacer);
      width: fit-content;
      padding: 0;
    }
  }

  .details {

    @media (--md) {
      overflow-y: auto;
      -webkit-overflow-scrolling: auto;
    }

    > * {
      &:not(:last-child) {
        border-bottom: var(--border);
      }
      padding: var(--spacer);

      @media (--md) {
        padding: var(--spacer) var(--spacer-lg);
      }
    }

    header {
      z-index: 100;
      display: grid;
      gap: var(--spacer-sm);
      background: var(--card-background);
      backdrop-filter: var(--blur);

      h1 {
        font-size: var(--font-lg);

        small {
          color: var(--muted);
        }
      }

      @media (--md) {
        padding: var(--spacer-lg);
        position: sticky;
        top: 0;
      }
    }
  }

  .auction-status {
    display: flex;
    gap: var(--spacer);
    flex-wrap: wrap;

    @media (--md) {
      justify-content: space-between;
    }
  }
</style>
