<template>
  <div v-if="! auction.settled && (! isConnected || isBidderOrBeneficiary)">
    <Connect v-if="! isConnected" class="block">Connect To Settle</Connect>
    <TransactionFlow
      v-else
      :request="settleRequest"
      :text="{
        title: {
          chain: 'Switch Chain',
          requesting: 'Confirm In Wallet',
          waiting: 'Transaction Submitted',
          complete: 'Success!'
        },
        lead: {
          chain: 'Requesting to switch chain...',
          requesting: 'Requesting Signature...',
          waiting: 'Checking Settle Transaction...',
          complete: `The auction was settled successfully...`,
        },
        action: {
          confirm: 'Settle',
          error: 'Settle',
          complete: 'OK',
        },
      }"
      @complete="settled"
      skip-confirmation
      auto-close-success
    >
      <template #start="{ start }">
        <Button @click="start" class="bid">
          Settle Auction
        </Button>
      </template>
    </TransactionFlow>
  </div>
</template>

<script setup>
import { useAccount } from '@wagmi/vue'

const { $wagmi } = useNuxtApp()
const config = useRuntimeConfig()
const { address, isConnected } = useAccount()
const store = useOnchainStore()

const props = defineProps({
  auction: Object,
})

const isBidderOrBeneficiary = computed(() => {
  const bidder = props.auction.latestBidder?.toLowerCase()
  const beneficiary = props.auction.beneficiary?.toLowerCase()
  const currentUser = address.value?.toLowerCase()

  return currentUser === bidder || currentUser === beneficiary
})

const settleRequest = computed(() => async () => {
  const fresh = await store.getAuction(props.auction.id)

  if (fresh.settled) return

  return writeContract($wagmi, {
    abi: AUCTIONS_ABI,
    chainId: config.public.chainId,
    address: config.public.auctionsAddress,
    functionName: 'settle',
    args: [
      props.auction.id,
    ],
    value: props.value,
    gas: 95_000n,
  })
})

const settled = () => store.getAuction(props.auction.id)
</script>

<style scoped>
.button {
  width: 100%;
}
</style>
